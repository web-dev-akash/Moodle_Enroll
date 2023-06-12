const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();
const app = express();
app.use(express.json());

app.use(cors());
const url = `https://wisechamps.app/webservice/rest/server.php`;
const watiAPI = `https://live-server-105694.wati.io`;
const WATI_TOKEN = process.env.WATI_TOKEN;
const WSTOKEN = process.env.WSTOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PORT = process.env.PORT || 8080;
const cron = require("node-cron");

const courseFormat = [
  {
    // Math
    G4: "420",
    G5: "421",
    G6: "422",
  },
  {
    // English
    G4: "424",
    G5: "425",
    G6: "426",
  },
  {
    // Science
    G4: "427",
    G5: "428",
    G6: "429",
  },
  {
    // GK
    G4: "430",
    G5: "431",
    G6: "432",
  },
];

const allLiveQuizCourses = [
  "420",
  "421",
  "422",
  "424",
  "425",
  "426",
  "427",
  "428",
  "429",
  "430",
  "431",
  "432",
];
const wstoken = process.env.WSTOKEN;
const wsfunctionCreate = "core_user_create_users";
const wsfunctionEnrol = "enrol_manual_enrol_users";
const wsfunctionGetContent = "core_course_get_contents";

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }
  const token = authHeader.split(" ")[1];
  try {
    if (token == AUTH_TOKEN) {
      next();
    } else {
      return res.status(401).json({ message: "Invalid token" });
    }
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const getTrailTime = () => {
  let start = new Date();
  start.setHours(0, 0, 0, 0);

  let end = new Date();
  end.setHours(23, 59, 59, 999);

  let startTime = Math.floor(start.valueOf() / 1000);
  let endTime = Math.floor(end.valueOf() / 1000) + 604800;
  return {
    startTime,
    endTime,
  };
};

const getPaidTime = () => {
  let start = new Date();
  start.setHours(0, 0, 0, 0);

  let end = new Date();
  end.setHours(23, 59, 59, 999);

  let startTime = Math.floor(start.valueOf() / 1000);
  let endTime = Math.floor(end.valueOf() / 1000) + 31536000;
  return {
    startTime,
    endTime,
  };
};

const getWeeklySchedule = async (url, wstoken) => {
  const { startTime, endTime } = getTrailTime();
  const res = await axios.get(
    `${url}?wstoken=${wstoken}&wsfunction=core_course_get_courses_by_field&[options][ids]&moodlewsrestformat=json`
  );
  const data = res.data.courses;
  const filteredData = data.filter((response) => {
    return response.shortname.includes("Workshop");
  });
  const eventPromises = filteredData.map(async (course) => {
    const courseID = course.id;
    const event = await axios.get(
      `${url}?wstoken=${wstoken}&&wsfunction=core_calendar_get_calendar_events&events[courseids][0]=${courseID}&options[timestart]=${startTime}&options[timeend]=${endTime}&moodlewsrestformat=json`
    );
    return event.data.events;
  });
  const eventsOfTheWeek = await Promise.all(eventPromises);
  return eventsOfTheWeek.flat();
};

const getExistingUser = async (username) => {
  const res = await axios.get(
    `${url}?wstoken=${wstoken}&&wsfunction=core_user_get_users_by_field&field=username&values[0]=${username}&moodlewsrestformat=json`
  );
  return res.data;
};

const createUser = async ({
  email,
  firstname,
  lastname,
  phone,
  subscription,
  trialExpiry,
}) => {
  const res = await axios.post(
    `${url}?wstoken=${wstoken}&wsfunction=${wsfunctionCreate}&users[0][username]=${email}&users[0][password]=${phone}&users[0][firstname]=${firstname}&users[0][lastname]=${lastname}&users[0][email]=${email}&users[0][phone1]=${phone}&users[0][customfields][0][type]=live_quiz_subscription&users[0][customfields][0][value]=${subscription}&users[0][customfields][1][type]=trailexpirydate&users[0][customfields][1][value]=${trialExpiry}&moodlewsrestformat=json`
  );
  return res.data;
};

const enrolUserToCourse = async ({ courseId, timeStart, timeEnd, userId }) => {
  const res = await axios.post(
    `${url}?wstoken=${wstoken}&wsfunction=${wsfunctionEnrol}&enrolments[0][roleid]=5&enrolments[0][userid]=${userId}&enrolments[0][courseid]=${courseId}&enrolments[0][timestart]=${timeStart}&enrolments[0][timeend]=${timeEnd}&moodlewsrestformat=json`
  );
  return res.data;
};

const getCourseContent = async (courseId) => {
  const res = await axios.get(
    `${url}?wstoken=${wstoken}&wsfunction=${wsfunctionGetContent}&courseid=${courseId}&moodlewsrestformat=json`
  );
  return res.data;
};

app.get("/", (req, res) => {
  res.status(200).send({
    message: "Server Started",
  });
});

const updateScheduleLogsinGoogleSheet = async (phone) => {
  const newPhone =
    phone.length > 10 ? Number(phone.substring(2, phone.length)) : phone;
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const auth = new google.auth.GoogleAuth({
    keyFile: "key.json", //the key file
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });

  const authClientObject = await auth.getClient();
  const sheet = google.sheets({
    version: "v4",
    auth: authClientObject,
  });

  const writeData = await sheet.spreadsheets.values.append({
    auth, //auth object
    spreadsheetId, //spreadsheet id
    range: "Schedule Logs!A:B", //sheet name and range of cells
    valueInputOption: "USER_ENTERED", // The information will be passed according to what the usere passes in as date, number or text
    resource: {
      values: [[newPhone, new Date().toLocaleDateString()]],
    },
  });

  return writeData.data;
};

const getZohoToken = async () => {
  try {
    const res = await axios.post(
      `https://accounts.zoho.com/oauth/v2/token?client_id=${CLIENT_ID}&grant_type=refresh_token&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`
    );
    const token = res.data.access_token;
    return token;
  } catch (error) {
    res.send({
      error,
    });
  }
};

const searchContactInZoho = async (phone, zohoConfig) => {
  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v2/Contacts/search?phone=${phone}`,
    zohoConfig
  );
  return contact.data;
};

const addTagsToContact = async (contactId, zohoConfig) => {
  const body = {
    tags: [
      {
        name: "sawlivequizschedule",
        id: "4878003000001391013",
        color_code: "#969696",
      },
    ],
  };
  await axios.post(
    `https://www.zohoapis.com/crm/v3/Contacts/${contactId}/actions/add_tags`,
    body,
    zohoConfig
  );
};

const searchDealByContact = async (contactId, zohoConfig) => {
  const deal = await axios.get(
    `https://www.zohoapis.com/crm/v2/Deals/search?criteria=Contact_Name:equals:${contactId}`,
    zohoConfig
  );
  return deal.data;
};

const addTagsToDeal = async (dealId, zohoConfig) => {
  const body = {
    tags: [
      {
        name: "sawlivequizschedule",
        id: "4878003000001388010",
        color_code: "#D297EE",
      },
    ],
  };
  await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/${dealId}/actions/add_tags`,
    body,
    zohoConfig
  );
};

const getGrade = (index) => {
  const grades = ["4", "5", "6"];
  const gradeIndex = index % grades.length;
  return grades[gradeIndex];
};

app.get("/getWeeklySchedule", async (req, res) => {
  try {
    const phone = req.query.phone;
    if (phone) {
      const zohoToken = await getZohoToken();
      const zohoConfig = {
        headers: {
          Authorization: `Bearer ${zohoToken}`,
        },
      };

      await updateScheduleLogsinGoogleSheet(phone);

      const contact = await searchContactInZoho(phone, zohoConfig);
      if (!contact.data) {
        return res.status(200).send("Not a Contact in Zoho");
      }
      const contactId = contact.data[0].id;
      await addTagsToContact(contactId, zohoConfig);

      const deal = await searchDealByContact(contactId, zohoConfig);
      if (deal.data && deal.data.length > 0) {
        const dealId = deal.data[0].id;
        await addTagsToDeal(dealId, zohoConfig);
      }
    }

    const finalWeeklyData = [];
    const weeklyData = await getWeeklySchedule(url, wstoken);

    for (i = 0; i < allLiveQuizCourses.length; i++) {
      let cid = allLiveQuizCourses[i];
      let subject = "";
      if (i <= 2) {
        subject = "Math";
      } else if (i > 2 && i <= 5) {
        subject = "English";
      } else if (i > 5 && i <= 8) {
        subject = "Science";
      } else if (i > 8 && i <= 11) {
        subject = "GK";
      }
      let grade = getGrade(i);
      const courseData = await getCourseContent(cid);
      courseData.forEach((res) => {
        const data = res.modules;
        if (data.length > 0) {
          data.forEach((module) => {
            // console.log("module", module.instance);
            weeklyData.forEach((week) => {
              // console.log("week", week.instance);
              if (week.instance === module.instance) {
                let time = week.timestart - 2400;
                finalWeeklyData.push({
                  subject,
                  name: res.name,
                  timestamp: time,
                  grade,
                });
              }
            });
          });
        }
      });
    }

    return res.status(200).send({
      status: "success",
      data: finalWeeklyData,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: "error",
      error,
    });
  }
});

const updateTrailSubscription = async (userId, subscription, expiry) => {
  const urlS = `${url}?wstoken=${wstoken}&wsfunction=core_user_update_users&users[0][id]=${userId}&users[0][customfields][0][type]=live_quiz_subscription&users[0][customfields][0][value]=${subscription}&users[0][customfields][1][type]=trailexpirydate&users[0][customfields][1][value]=${expiry}&moodlewsrestformat=json`;
  const res = await axios.get(urlS);
  return res.data;
};

function getUniqueObjects(arr, prop) {
  const seen = new Set();
  return arr.filter((obj) => {
    const key = prop ? obj[prop] : JSON.stringify(obj);
    return seen.has(key) ? false : seen.add(key);
  });
}

const changeSubscriptionType = async () => {
  let start = new Date().setHours(23, 59, 59, 999);
  let startTime = Math.floor(start.valueOf() / 1000);
  const totalLiveQuizUsers = [];
  try {
    for (let i = 0; i < 12; i++) {
      const courseid = allLiveQuizCourses[i];
      const res = await axios.get(
        `${url}?wstoken=${wstoken}&wsfunction=core_enrol_get_enrolled_users&courseid=${courseid}&moodlewsrestformat=json`
      );
      if (res.data && res.data.length > 0) {
        const data = res.data;
        for (let j = 0; j < data.length; j++) {
          totalLiveQuizUsers.push(data[j]);
        }
      }
    }
    const filteredUsers = getUniqueObjects(totalLiveQuizUsers, "id");
    for (let i = 0; i < filteredUsers.length; i++) {
      const data = filteredUsers[i].customfields;
      const timestamp = Number(data[data.length - 3].value);
      if (startTime + 86400 == timestamp) {
        await updateTrailSubscription(filteredUsers[i].id, "Trail Expired", 0);
      } else {
        return false;
      }
    }
    return true;
  } catch (error) {
    return error;
  }
};

// cron.schedule("59 23 * * *", async () => {
//   const data = await changeSubscriptionType();
//   console.log(data);
// });

app.get("/moodle", async (req, res) => {
  try {
    const data = req.body;
    return res.status(200).send({
      data,
    });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

app.post("/createTrailUser", authMiddleware, async (req, res) => {
  try {
    let { email, phone, student_name, student_grade } = req.body;
    console.log("Started the flow");
    if (phone.length > 10) {
      phone = phone.substring(phone.length - 10, phone.length);
    }
    email = email.toLowerCase();
    const firstname = student_name.split(" ")[0];
    let lastname = "";
    if (student_name.split(" ").length == 1) {
      lastname = ".";
    } else {
      lastname = student_name.split(" ")[1];
      if (lastname[0] == " ") {
        lastname = ".";
      }
    }
    let grade = "";
    if (student_grade.includes("4")) {
      grade = "G4";
    } else if (student_grade.includes("5")) {
      grade = "G5";
    } else {
      grade = "G6";
    }
    const userExist = await getExistingUser(email);
    let { startTime, endTime } = getTrailTime();
    if (userExist.length == 0) {
      try {
        const user = await createUser({
          email,
          firstname,
          lastname,
          phone,
          subscription: "Trail",
          trialExpiry: endTime,
        });
        const uid = user[0].id;
        for (i = 0; i < 4; i++) {
          const cid = courseFormat[i][grade];
          await enrolUserToCourse({
            courseId: cid,
            timeStart: startTime,
            timeEnd: endTime,
            userId: uid,
          });
        }
        user[0].password = phone;
        return res.status(200).send({
          user,
          status: "trialactivated",
        });
      } catch (error) {
        return res.status(500).send({
          error,
        });
      }
    } else {
      const data = userExist[0].customfields;
      const subscription = data[data.length - 1].value;
      if (subscription == "NA") {
        try {
          const userId = userExist[0].id;
          await updateTrailSubscription(userId, "Trail", endTime);
          for (i = 0; i < 4; i++) {
            const cid = courseFormat[i][grade];
            await enrolUserToCourse({
              courseId: cid,
              timeStart: startTime,
              timeEnd: endTime,
              userId,
            });
          }
          console.log("trail activated");
          return res.status(200).send({
            user: [
              {
                id: userExist[0].id,
                username: userExist[0].email,
                password: phone,
              },
            ],
            status: "trialactivated",
          });
        } catch (error) {
          return res.status(404).send({
            message: "User not found",
          });
        }
      } else if (subscription == "Trail") {
        console.log({ email: userExist[0].email, status: "trialinprogress" });
        return res.status(200).send({
          user: [
            {
              id: userExist[0].id,
              username: userExist[0].email,
              password: phone,
            },
          ],
          status: "trialinprogress",
        });
      } else if (subscription == "Tier 1" || subscription == "Tier 2") {
        return res.status(200).send({
          user: [
            {
              id: userExist[0].id,
              username: userExist[0].email,
              password: phone,
            },
          ],
          status: "alreadyapaiduser",
        });
      } else if (subscription == "Trail Expired") {
        return res.status(200).send({
          user: [
            {
              id: userExist[0].id,
              username: userExist[0].email,
              password: phone,
            },
          ],
          status: "trialexpired",
        });
      } else if (subscription == "Subscription Expired") {
        return res.status(200).send({
          user: [
            {
              id: userExist[0].id,
              username: userExist[0].email,
              password: phone,
            },
          ],
          status: "subscriptionexpired",
        });
      }
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      status: error,
    });
  }
});

app.post("/getUserId", authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await getExistingUser(email);
    return res.status(200).send({
      userId: user[0].id,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      error,
    });
  }
});

const updatePaidSubscription = async (userid, endTime) => {
  const urlS = `${url}?wstoken=${wstoken}&wsfunction=core_user_update_users&users[0][id]=${userid}&users[0][customfields][0][type]=subscriptionexpirydate&users[0][customfields][0][value]=${endTime}&moodlewsrestformat=json`;
  const res = await axios.get(urlS);
  return res.data;
};

app.post("/enrolPaidUser", authMiddleware, async (req, res) => {
  const { list_of_subjects, student_grade, email } = req.body;
  const user = await getExistingUser(email);
  const userId = user[0].id;
  const { startTime, endTime } = getPaidTime();
  let grade = "";
  if (student_grade.includes("4")) {
    grade = "G4";
  } else if (student_grade.includes("5")) {
    grade = "G5";
  } else if (student_grade.includes("6")) {
    grade = "G6";
  } else {
    return res.status(404).send({
      status: "error",
      message: "Course not found",
    });
  }
  await updatePaidSubscription(userId, endTime);
  if (list_of_subjects == "Math") {
    try {
      const cid = courseFormat[0][grade];
      const data = await enrolUserToCourse({
        courseId: cid,
        timeStart: startTime,
        timeEnd: endTime,
        userId,
      });
      return res.status(200).send({
        status: "success",
        data,
      });
    } catch (error) {
      return res.status(500).send({
        error,
      });
    }
  } else if (list_of_subjects == "English") {
    try {
      const cid = courseFormat[1][grade];
      const data = await enrolUserToCourse({
        courseId: cid,
        timeStart: startTime,
        timeEnd: endTime,
        userId,
      });
      return res.status(200).send({
        status: "success",
        data,
      });
    } catch (error) {
      return res.status(500).send({
        error,
      });
    }
  } else if (list_of_subjects == "Science") {
    try {
      const cid = courseFormat[2][grade];
      const data = await enrolUserToCourse({
        courseId: cid,
        timeStart: startTime,
        timeEnd: endTime,
        userId,
      });
      return res.status(200).send({
        status: "success",
        data,
      });
    } catch (error) {
      return res.status(500).send({
        error,
      });
    }
  } else if (list_of_subjects == "GK") {
    try {
      const cid = courseFormat[3][grade];
      await enrolUserToCourse({
        courseId: cid,
        timeStart: startTime,
        timeEnd: endTime,
        userId,
      });
      return res.status(200).send({
        status: "success",
      });
    } catch (error) {
      return res.status(500).send({
        error,
      });
    }
  } else if (
    list_of_subjects.includes("GK") &&
    list_of_subjects.includes("Science") &&
    list_of_subjects.includes("English") &&
    list_of_subjects.includes("Math")
  ) {
    try {
      for (i = 0; i < 4; i++) {
        const cid = courseFormat[i][grade];
        await enrolUserToCourse({
          courseId: cid,
          timeStart: startTime,
          timeEnd: endTime,
          userId,
        });
      }
      return res.status(200).send({
        status: "success",
      });
    } catch (error) {
      return res.status(500).send({
        error,
      });
    }
  }
});

const linkShortner = async (url) => {
  const config = {
    headers: {
      apiKey: process.env.SHORTNER_API,
      "Content-Type": "application/json",
    },
  };
  const body = {
    redirect: "follow",
    long_url: url,
  };

  const res = await axios.post(
    `https://api.apilayer.com/short_url/hash`,
    body,
    config
  );
  return res.data;
};

app.post("/refer", async (req, res) => {
  try {
    const data = req.body;
    const referral_name = data.referral_name;
    const referee_name = data.referee_name;
    const phone = data.phone;

    const referral_link = `https://wa.me/919717094422?text=Hello%20Wisechamps%0A%0A${referee_name}%20with%20${phone}%20invited%20me%20to%20experience%20your%201-week%20live%20quiz%20trial.%20Can%20you%20please%20activate%20my%20trial%3F%0A%0A${referral_name}`;

    const response = await linkShortner(referral_link);
    res.status(200).send({
      url: response.short_url,
    });
  } catch (error) {
    res.status(500).send({
      error,
    });
  }
});

const updatePointsInZoho = async (refereePhone, referralPhone) => {
  const token = await getZohoToken();
  console.log(refereePhone, referralPhone);
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  const lead = await axios.get(
    `https://www.zohoapis.com/crm/v2/Leads/search?phone=${referralPhone}`,
    config
  );
  if (!lead.data && lead.data.length == 0) {
    return "No Lead Found";
  }
  const leadid = lead.data.data[0].id;
  const leadBody = {
    data: [
      {
        id: leadid,
        Lead_Source: "Referral",
        $append_values: {
          Lead_Source: true,
        },
      },
    ],
    duplicate_check_fields: ["id"],
    apply_feature_execution: [
      {
        name: "layout_rules",
      },
    ],
    trigger: ["workflow"],
  };

  const updateLead = await axios.post(
    `https://www.zohoapis.com/crm/v3/Leads/upsert`,
    leadBody,
    config
  );

  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v2/Contacts/search?phone=${refereePhone}`,
    config
  );
  const contactId = contact.data.data[0].id;
  const referralCount = contact.data.data[0].Referred_Count;
  let newReferralCount = 0;
  if (referralCount == null) {
    newReferralCount = 1;
  } else {
    newReferralCount = Number(referralCount) + 1;
  }
  const contactBody = {
    data: [
      {
        id: contactId,
        Referral_Count: newReferralCount,
        $append_values: {
          Referral_Count: true,
        },
      },
    ],
    duplicate_check_fields: ["id"],
    apply_feature_execution: [
      {
        name: "layout_rules",
      },
    ],
    trigger: ["workflow"],
  };

  const updateContact = await axios.post(
    `https://www.zohoapis.com/crm/v3/Contacts/upsert`,
    contactBody,
    config
  );

  const body = {
    tags: [
      {
        name: "referee",
        id: "4878003000001344027",
        color_code: "#1DB9B4",
      },
    ],
  };
  const updateTag = await axios.post(
    `https://www.zohoapis.com/crm/v3/Contacts/${contactId}/actions/add_tags`,
    body,
    config
  );

  const deal = await axios.get(
    `https://www.zohoapis.com/crm/v2/Deals/search?criteria=Contact_Name:equals:${contactId}`,
    config
  );
  const dealId = deal.data.data[0].id;
  const engagementScore =
    deal.data.data[0].Engagement_Score != null
      ? Number(deal.data.data[0].Engagement_Score)
      : 0;
  let newEngagementScore = 0;
  if (newReferralCount == 1) {
    newEngagementScore = engagementScore + 5;
  } else if (newReferralCount == 2) {
    newEngagementScore = engagementScore + 10;
  } else if (newReferralCount == 3) {
    newEngagementScore = engagementScore + 15;
  }

  const dealBody = {
    data: [
      {
        id: dealId,
        Engagement_Score: newEngagementScore,
        $append_values: {
          Engagement_Score: true,
        },
      },
    ],
    duplicate_check_fields: ["id"],
    apply_feature_execution: [
      {
        name: "layout_rules",
      },
    ],
    trigger: ["workflow"],
  };

  const updateDeal = await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/upsert`,
    dealBody,
    config
  );
  return deal.data;
};

app.post("/captureReferral", async (req, res) => {
  try {
    const { phone } = req.body;
    const config = {
      headers: {
        Authorization: `Bearer ${WATI_TOKEN}`,
      },
    };
    const response = await axios.get(
      `${watiAPI}/api/v1/getMessages/${phone}`,
      config
    );
    const data = response.data.messages.items;
    const msg = data.filter((msg) => {
      if (msg.text) {
        return msg.text.includes("invited me to experience");
      }
      return null;
    });
    if (msg.length == 0) {
      res.status(404).send({
        status: "No message found",
      });
    }
    const refereePhone = msg[0].text.substring(27, 39);
    const refereeData = await updatePointsInZoho(refereePhone, phone);
    res.status(200).send({
      refereeData,
    });
  } catch (error) {
    res.status(500).send({
      error,
    });
  }
});

const updateTagInZoho = async (phone) => {
  if (phone.length <= 10) {
    phone = `91${phone}`;
  }
  const res = await axios.post(
    `https://accounts.zoho.com/oauth/v2/token?client_id=${CLIENT_ID}&grant_type=refresh_token&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`
  );
  const token = res.data.access_token;
  const config = {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  };
  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v3/Contacts/search?phone=${phone}`,
    config
  );
  if (!contact.data) {
    return "Not a Zoho Contact";
  }
  const contactid = contact.data.data[0].id;
  const dealData = await axios.get(
    `https://www.zohoapis.com/crm/v3/Deals/search?criteria=((Contact_Name:equals:${contactid}))`,
    config
  );
  if (!dealData.data) {
    return "Not converted to deal";
  }
  const dealid = dealData.data.data[0].id;
  const body = {
    tags: [
      {
        name: "firstlogin",
        id: "4878003000000773056",
        color_code: "#FEDA62",
      },
    ],
  };
  const updateTag = await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/${dealid}/actions/add_tags`,
    body,
    config
  );

  const engagementScore =
    deal.data.data[0].Engagement_Score != null
      ? Number(deal.data.data[0].Engagement_Score)
      : 0;
  let newEngagementScore = engagementScore + 10;
  const dealBody = {
    data: [
      {
        id: dealid,
        Engagement_Score: newEngagementScore,
        $append_values: {
          Engagement_Score: true,
        },
      },
    ],
    duplicate_check_fields: ["id"],
    apply_feature_execution: [
      {
        name: "layout_rules",
      },
    ],
    trigger: ["workflow"],
  };

  const updateDeal = await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/upsert`,
    dealBody,
    config
  );
  return updateTag.data.data;
};

const getUserFirstAccess = async (data) => {
  const id = data.userid;
  const loggedinTime = data.timecreated;
  const res = await axios.get(
    `${URL}?wstoken=${WSTOKEN}&wsfunction=core_user_get_users_by_field&field=id&values[0]=${id}&moodlewsrestformat=json`
  );
  const firstaccess = res.data[0].firstaccess;
  const phone = res.data[0].phone1;
  const loggedDate = new Date(loggedinTime * 1000).toLocaleDateString();
  const firstDate = new Date(firstaccess * 1000).toLocaleDateString();
  if (firstDate == loggedDate) {
    const loggedTime = new Date(loggedinTime * 1000).toLocaleTimeString();
    const firstTime = new Date(firstaccess * 1000).toLocaleTimeString();
    if (loggedTime == firstTime) {
      const zoho = await updateTagInZoho(phone);
      return { zoho, status: "firstlogin" };
    }
  }
  return { status: "notfirstlogin" };
};

app.post("/firstLogin", async (req, res) => {
  try {
    const data = await getUserFirstAccess(req.body);
    return res.status(200).send({
      data,
    });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

// const getRegularLogin = async (data) => {
//   const id = data.userid;
//   const loggedinTime = data.timecreated;
//   const res = await axios.get(
//     `${URL}?wstoken=${WSTOKEN}&wsfunction=core_user_get_users_by_field&field=id&values[0]=${id}&moodlewsrestformat=json`
//   );
//   const firstaccess = res.data[0].firstaccess;
//   const phone = res.data[0].phone1;
//   const loggedDate = new Date(loggedinTime * 1000).toLocaleDateString();
//   const firstDate = new Date(
//     (Number(firstaccess) + 86400) * 1000
//   ).toLocaleDateString();
//   const secondDate = new Date(
//     (Number(firstaccess) + 172800) * 1000
//   ).toLocaleDateString();
//   const thirdDate = new Date(
//     (Number(firstaccess) + 259200) * 1000
//   ).toLocaleDateString();
//   const fourthDate = new Date(
//     (Number(firstaccess) + 345600) * 1000
//   ).toLocaleDateString();
//   const fifthDate = new Date(
//     (Number(firstaccess) + 432000) * 1000
//   ).toLocaleDateString();
//   let result = "";
//   if (loggedDate == firstDate) {
//     result = await upadeScoreinZoho(phone, 2);
//   } else if (loggedDate == secondDate) {
//     result = await upadeScoreinZoho(phone, 3);
//   } else if (loggedDate == thirdDate) {
//     result = await upadeScoreinZoho(phone, 5);
//   } else if (loggedDate == fourthDate) {
//     result = await upadeScoreinZoho(phone, 10);
//   } else if (loggedDate == fifthDate) {
//     result = await upadeScoreinZoho(phone, 20);
//   }
//   if (result == "") {
//     return { status: "More than 5 Days" };
//   }
//   return result;
// };

const percentage = (partialValue, totalValue) => {
  return Math.round((100 * partialValue) / totalValue);
};

const getSheetData = async () => {
  const id = "1J8T_fBa23LwSRoQIv4RAd1_1fhQ0UtQYtC7q6iJHA1A";
  const gid = "116082223";
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&tq&gid=${gid}`;
  const config = {
    headers: {
      "Content-Type": "text/xml",
    },
  };
  const txt = await axios.get(url, config);
  const txt2 = txt.data;
  const jsonString = txt2.slice(47, -2);
  const response = JSON.parse([jsonString]);
  return response.table.rows;
};

const updateReportLogsinGoogleSheet = async (user) => {
  // console.log("sheet 1");
  const date = new Date().getDate();
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const auth = new google.auth.GoogleAuth({
    keyFile: "key.json", //the key file
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });
  // console.log("sheet 2");

  const authClientObject = await auth.getClient();
  const sheet = google.sheets({
    version: "v4",
    auth: authClientObject,
  });
  // console.log("sheet 3");

  const writeData = sheet.spreadsheets.values.append({
    auth, //auth object
    spreadsheetId, //spreadsheet id
    range: "Report Logs!A:V", //sheet name and range of cells
    valueInputOption: "USER_ENTERED", // The information will be passed according to what the usere passes in as date, number or text
    resource: {
      values: [
        [
          user[0].email,
          new Date().toDateString(),
          new Date().toTimeString(),
          user[0].polled,
          user[0].correct,
          user[0].percent,
          user[0].percentile,
        ],
      ],
    },
  });

  // console.log("sheet 4");
  console.log(writeData.data);
  return writeData.data;
};

const updateTagBasedOnSessionAttepted = async (email) => {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const auth = new google.auth.GoogleAuth({
    keyFile: "key.json", //the key file
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });

  const authClientObject = await auth.getClient();
  const sheet = google.sheets({
    version: "v4",
    auth: authClientObject,
  });

  const readData = await sheet.spreadsheets.values.get({
    auth, //auth object
    spreadsheetId, // spreadsheet id
    range: "Report Logs!A:B", //range of cells to read from.
  });

  const zohoToken = await getZohoToken();
  const zohoConfig = {
    headers: {
      Authorization: `Bearer ${zohoToken}`,
    },
  };

  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v2/Contacts/search?email=${email}`,
    zohoConfig
  );
  if (!contact.data) {
    return "Not a Contact in Zoho";
  }
  const contactId = contact.data.data[0].id;
  const deal = await axios.get(
    `https://www.zohoapis.com/crm/v2/Deals/search?criteria=Contact_Name:equals:${contactId}`,
    zohoConfig
  );
  if (!deal.data) {
    return "Not a Deal in Zoho";
  }
  const dealId = deal.data.data[0].id;

  let flag = false;
  const data = readData.data.values;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == email) {
      const date = data[i][1];
      if (date !== new Date().toLocaleDateString()) {
        flag = true;
        break;
      }
    }
  }
  if (flag) {
    const removeBody = {
      tags: [
        {
          name: "viewedreportonce",
        },
      ],
    };
    await axios.post(
      `https://www.zohoapis.com/crm/v3/Deals/${dealId}/actions/remove_tags`,
      removeBody,
      zohoConfig
    );

    const body = {
      tags: [
        {
          name: "viewedreportmorethanonce",
          id: "4878003000001336301",
          color_code: "#57B1FD",
        },
      ],
    };
    await axios.post(
      `https://www.zohoapis.com/crm/v3/Deals/${dealId}/actions/add_tags`,
      body,
      zohoConfig
    );
  } else {
    const body = {
      tags: [
        {
          name: "viewedreportonce",
          id: "4878003000001336294",
          color_code: "#879BFC",
        },
      ],
    };
    await axios.post(
      `https://www.zohoapis.com/crm/v3/Deals/${dealId}/actions/add_tags`,
      body,
      zohoConfig
    );
  }
  return readData.data;
};

app.get("/reports", async (req, res) => {
  try {
    const email = req.query.email;
    await updateTagBasedOnSessionAttepted(email);
    const grades = [4, 5, 6, 7];
    const percentArray = [];
    const rows = await getSheetData();
    const aggregatedData = [];
    for (let i = 0; i < rows.length; i++) {
      const email = rows[i].c[3].v;
      const correct = rows[i].c[2].v;
      const attempted = rows[i].c[6].v;
      const polled = rows[i].c[7].v;
      const grade = rows[i].c[8].v;
      const name =
        rows[i].c[1] !== null
          ? `${rows[i].c[0].v} ${rows[i].c[1].v}`
          : `${rows[i].c[0].v}`;
      const existingUser = aggregatedData.find((user) => user.email === email);

      if (existingUser) {
        existingUser.correct += correct;
        existingUser.attempted += attempted;
        existingUser.polled += polled;
      } else {
        const newUser = {
          email: email,
          grade: grade,
          correct: correct,
          attempted: attempted,
          polled: polled,
          name: name,
        };
        aggregatedData.push(newUser);
      }
    }
    // console.log("third");
    for (let i = 0; i < aggregatedData.length; i++) {
      const email = aggregatedData[i].email;
      const correct = aggregatedData[i].correct;
      const attempted = aggregatedData[i].attempted;
      const polled = aggregatedData[i].polled;
      const grade = aggregatedData[i].grade;
      const name = aggregatedData[i].name;
      const percent = percentage(correct, polled);
      percentArray.push({
        email,
        percent,
        grade,
        attempted,
        correct,
        polled,
        name,
      });
    }
    const sortedPercentArray = percentArray.sort(
      (a, b) => a.percent - b.percent
    );
    const finalData = [];
    for (let j = 0; j < grades.length; j++) {
      const percentileArray = [];
      const grade = grades[j];
      const data = sortedPercentArray.filter((user) => {
        return user.grade == grade;
      });
      for (let i = 0; i < data.length; i++) {
        const p = Math.round((i / data.length) * 100);
        percentileArray.push({
          email: data[i].email,
          percent: data[i].percent,
          grade: data[i].grade,
          attempted: data[i].attempted,
          correct: data[i].correct,
          polled: data[i].polled,
          sessionid: data[i].sessionid,
          name: data[i].name,
          percentile: p,
          rank: data.length - i,
        });
      }
      const percentMap = new Map();
      for (const item of percentileArray) {
        const { percent, percentile } = item;
        if (!percentMap.has(percent) || percentile > percentMap.get(percent)) {
          percentMap.set(percent, percentile);
        }
      }
      for (const item of percentileArray) {
        const { percent } = item;
        item.percentile = percentMap.get(percent);
      }
      finalData.push(...percentileArray);
    }
    // console.log("four");
    const user = finalData.filter((value) => {
      return value.email === email;
    });
    if (!user || user.length == 0) {
      return res.status(404).send({
        status: "error",
        message: "User not found",
      });
    }
    await updateReportLogsinGoogleSheet(user);
    // console.log("five");
    return res.status(200).send({
      user,
    });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

const updateScoreinZoho = async (email, addScore) => {
  const res = await axios.post(
    `https://accounts.zoho.com/oauth/v2/token?client_id=${CLIENT_ID}&grant_type=refresh_token&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`
  );
  const token = res.data.access_token;
  const config = {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  };

  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v3/Contacts/search?email=${email}`,
    config
  );

  if (!contact.data) {
    return "Not a Zoho Contact";
  }
  const contactid = contact.data.data[0].id;
  const dealData = await axios.get(
    `https://www.zohoapis.com/crm/v3/Deals/search?criteria=((Contact_Name:equals:${contactid}))`,
    config
  );
  if (!dealData.data) {
    return "Not converted to deal";
  }
  const dealid = dealData.data.data[0].id;
  const engagementScore =
    dealData.data.data[0].Engagement_Score != null
      ? Number(dealData.data.data[0].Engagement_Score)
      : 0;
  let newEngagementScore = engagementScore + addScore;
  const dealBody = {
    data: [
      {
        id: dealid,
        Engagement_Score: newEngagementScore,
        $append_values: {
          Engagement_Score: true,
        },
      },
    ],
    duplicate_check_fields: ["id"],
    apply_feature_execution: [
      {
        name: "layout_rules",
      },
    ],
    trigger: ["workflow"],
  };

  const updateDeal = await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/upsert`,
    dealBody,
    config
  );
  return updateDeal.data;
};

const updateStageInZoho = async (email) => {
  const res = await axios.post(
    `https://accounts.zoho.com/oauth/v2/token?client_id=${CLIENT_ID}&grant_type=refresh_token&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`
  );
  const token = res.data.access_token;
  const config = {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  };
  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v3/Contacts/search?email=${email}`,
    config
  );
  if (!contact.data) {
    return "Not a Zoho Contact";
  }
  const contactid = contact.data.data[0].id;
  const dealData = await axios.get(
    `https://www.zohoapis.com/crm/v3/Deals/search?criteria=((Contact_Name:equals:${contactid}))`,
    config
  );
  if (!dealData.data) {
    return "Not converted to deal";
  }
  const dealid = dealData.data.data[0].id;
  const body = {
    data: [
      {
        id: dealid,
        Stage: "Attendee",
        $append_values: {
          Stage: true,
        },
      },
    ],
    duplicate_check_fields: ["id"],
    apply_feature_execution: [
      {
        name: "layout_rules",
      },
    ],
    trigger: ["workflow"],
  };
  const deal = await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/upsert`,
    body,
    config
  );
  return deal.data;
};

// app.get("/test", async (req, res) => {
//   const data = await updateStageInZoho("rajtosh@gmail.com");
//   res.send({
//     data,
//   });
// });

const checkRegularAttendeeTag = async (email) => {
  const res = await axios.post(
    `https://accounts.zoho.com/oauth/v2/token?client_id=${CLIENT_ID}&grant_type=refresh_token&client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`
  );
  const token = res.data.access_token;
  const config = {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  };
  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v3/Contacts/search?email=${email}`,
    config
  );
  if (!contact.data) {
    return "Not a Zoho Contact";
  }
  const contactid = contact.data.data[0].id;
  const dealData = await axios.get(
    `https://www.zohoapis.com/crm/v3/Deals/search?criteria=((Contact_Name:equals:${contactid}))`,
    config
  );
  if (!dealData.data) {
    return "Not converted to deal";
  }
  const dealid = dealData.data.data[0].id;
  const body = {
    tags: [
      {
        name: "regularattendance",
        id: "4878003000000773058",
        color_code: "#FEDA62",
      },
    ],
  };
  const updateTag = await axios.post(
    `https://www.zohoapis.com/crm/v3/Deals/${dealid}/actions/add_tags`,
    body,
    config
  );
  return updateTag.data;
};

const getRegularLogin = async () => {
  const aggregatedData = [];
  const users = [];
  const rows = await getSheetData();
  for (let i = 0; i < rows.length; i++) {
    const email = rows[i].c[3].v;
    const currentDate = new Date().toLocaleDateString();
    const date = new Date(rows[i].c[4].f).toLocaleDateString();
    const sessionid = rows[i].c[5].v;
    const existingUser = aggregatedData.find((user) => user.email === email);
    if (existingUser) {
      existingUser.sessions.push({
        sessionid,
      });
      date == currentDate &&
        existingUser.currentDate.push({
          date: currentDate,
        });
      date < currentDate &&
        existingUser.prevDate.push({
          date: date,
        });
    } else {
      const newUser = {
        email: email,
        currentDate: [
          {
            date: currentDate,
          },
        ],
        prevDate: [
          {
            date: date,
          },
        ],
        sessions: [
          {
            sessionid,
          },
        ],
      };
      aggregatedData.push(newUser);
    }
  }
  const score = [2, 3, 5, 10, 20];

  aggregatedData.map(async (user, index) => {
    let obj;
    if (user.prevDate.length >= 5) {
      obj = await checkRegularAttendeeTag(user.email);
    } else if (
      user.prevDate.length == 1 &&
      user.prevDate[0].date == user.currentDate[0].date
    ) {
      await updateStageInZoho(user.email);
      if (
        user.currentDate &&
        user.currentDate.length > 0 &&
        user.currentDate.length < 5
      ) {
        for (let i = 0; i < user.currentDate.length; i++) {
          obj = await updateScoreinZoho(user.email, score[i]);
        }
      } else if (
        user.currentDate &&
        user.currentDate.length > 0 &&
        user.currentDate.length >= 5
      ) {
        for (let i = 0; i < 5; i++) {
          obj = await updateScoreinZoho(user.email, score[i]);
        }
      }
    } else if (user.prevDate.length < 5) {
      const sessionLeft = 5 - user.prevDate.length;
      const currentSession = user.sessions.length - user.prevDate.length;
      if (currentSession >= sessionLeft) {
        for (let i = 0; i < sessionLeft; i++) {
          let length = user.prevDate.length + i;
          obj = await updateScoreinZoho(user.email, score[length]);
        }
      } else {
        for (let i = 0; i < currentSession; i++) {
          let length = user.prevDate.length + i;
          obj = await updateScoreinZoho(user.email, score[length]);
        }
      }
    }
    users.push(obj);
  });
  return users;
};

app.get("/regularLogin", async (req, res) => {
  try {
    const data = await getRegularLogin();
    return res.status(200).send({
      data,
    });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

const getScheduleFromSheet = async () => {
  const { startTime, endTime } = getTrailTime();
  const finalWeeklyData = [];
  const spreadsheetId = process.env.SCHEDULE_SPREADSHEET_ID;
  const auth = new google.auth.GoogleAuth({
    keyFile: "key.json", //the key file
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });

  const authClientObject = await auth.getClient();
  const sheet = google.sheets({
    version: "v4",
    auth: authClientObject,
  });

  const readData = await sheet.spreadsheets.values.get({
    auth, //auth object
    spreadsheetId, // spreadsheet id
    range: "Schedule!A:I", //range of cells to read from.
  });
  const data = readData.data.values;
  // console.log(data);
  for (let i = 1; i < data.length; i++) {
    // i === 1 && console.log(data[i]);
    const sessionid = data[i][0] ? data[i][0] : "";
    const day = data[i][3];
    const date = data[i][4].split("/");
    const time = data[i][5];
    const grade = data[i][6];
    const subject = data[i][7];
    const topic = data[i].length > 8 ? data[i][8] : "NA";

    // console.log(topic);

    const newDate = new Date(date[2], Number(date[1]) - 1, date[0]);
    const timestamp = Math.floor(newDate.getTime() / 1000);
    if (timestamp >= startTime && timestamp <= endTime) {
      const obj = {
        day,
        time,
        grade,
        subject,
        topic,
        timestamp,
        sessionid,
      };
      finalWeeklyData.push(obj);
    }
  }
  return finalWeeklyData;
};

app.get("/weeklySchedule", async (req, res) => {
  try {
    const phone = req.query.phone;
    if (phone) {
      const zohoToken = await getZohoToken();
      const zohoConfig = {
        headers: {
          Authorization: `Bearer ${zohoToken}`,
        },
      };

      await updateScheduleLogsinGoogleSheet(phone);

      const contact = await searchContactInZoho(phone, zohoConfig);
      if (!contact.data) {
        return res.status(200).send("Not a Contact in Zoho");
      }
      const contactId = contact.data[0].id;
      await addTagsToContact(contactId, zohoConfig);

      const deal = await searchDealByContact(contactId, zohoConfig);
      if (deal.data && deal.data.length > 0) {
        const dealId = deal.data[0].id;
        await addTagsToDeal(dealId, zohoConfig);
      }
    }
    const data = await getScheduleFromSheet();
    res.send({
      data,
    });
  } catch (error) {
    res.status(500).send({
      error,
    });
  }
});

const getPreviousReportData = async (email) => {
  const userData = [];
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const auth = new google.auth.GoogleAuth({
    keyFile: "key.json", //the key file
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });

  const authClientObject = await auth.getClient();
  const sheet = google.sheets({
    version: "v4",
    auth: authClientObject,
  });

  const readData = await sheet.spreadsheets.values.get({
    auth, //auth object
    spreadsheetId, // spreadsheet id
    range: "Report Logs!A:G", //range of cells to read from.
  });
  const data = readData.data.values;
  // return data;
  for (let i = 1; i < data.length; i++) {
    const userEmail = data[i][0];
    const date = data[i][1];
    const totalPolled = data[i][3];
    const totalCorrect = data[i][4];
    const totalPercent = data[i][5];
    const totalPercentile = data[i][6];
    if (data[i][0] === email) {
      userData.push({
        email: userEmail,
        date,
        totalPolled,
        totalCorrect,
        totalPercent,
        totalPercentile,
      });
    }
  }
  return userData;
};

app.get("/previousReport", async (req, res) => {
  try {
    const email = req.query.email;
    const data = await getPreviousReportData(email);
    res.send({
      data,
    });
  } catch (error) {
    res.status(500).send({
      error,
    });
  }
});

app.post("/template/topic", async (req, res) => {
  try {
    const today = new Date().toDateString();
    const { grade } = req.body;
    // console.log(grade);
    const weeklyData = await getScheduleFromSheet();
    // console.log(weeklyData);
    const gradeData = weeklyData.filter((val) => val.grade == grade);
    const todaysTopic = gradeData.filter((val) => {
      const date = new Date(val.timestamp * 1000).toDateString();
      return date === today;
    });
    if (todaysTopic.length === 0) {
      return res.status(404).send({ message: "No Topic for Today" });
    }
    res.send({ data: todaysTopic[0].subject });
  } catch (error) {
    res.status(500).send({
      error,
    });
  }
});

const getMaxAndAvgScoreBasedonGrade = async (grade) => {
  const today = new Date().toDateString();
  const weeklyData = await getScheduleFromSheet();
  const gradeData = weeklyData.filter((val) => val.grade == grade);
  const todaysTopic = gradeData.filter((val) => {
    const date = new Date(val.timestamp * 1000).toDateString();
    return date === today;
  });
  if (todaysTopic.length === 0) {
    return res.status(404).send({ message: "No Topic for Today" });
  }
  const topic = todaysTopic[0];

  // const percentArray = [];
  const rows = await getSheetData();
  // return res.send({ rows });
  const aggregatedData = [];
  for (let i = 0; i < rows.length; i++) {
    const sessionid = rows[i].c[5].v;
    const grade = rows[i].c[8].v;
    const date = rows[i].c[4].f;
    const correct = rows[i].c[2].v;
    if (grade === topic.grade) {
      aggregatedData.push({ sessionid, date, correct });
    }
  }

  const todaysData = aggregatedData.filter((val) => {
    return (
      +val.sessionid === +topic.sessionid &&
      new Date(val.date).toDateString() ==
        new Date(topic.timestamp * 1000).toDateString()
    );
  });

  const finalData = todaysData.sort((a, b) => b.correct - a.correct);
  return finalData;
};

app.post("/template/highestScore", async (req, res) => {
  try {
    const { grade } = req.body;
    // console.log(grade);
    const finalData = await getMaxAndAvgScoreBasedonGrade(grade);
    const max = finalData[0].correct;
    return res.send({ max });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

app.post("/template/avgScore", async (req, res) => {
  try {
    const { grade } = req.body;
    const finalData = await getMaxAndAvgScoreBasedonGrade(grade);
    const length = finalData.length;
    const total = finalData.reduce(
      (previousValue, currentValue) =>
        previousValue.correct + currentValue.correct
    );
    const avg = Math.round(total / length);
    return res.send({ avg });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

app.post("/template/totalParticipants", async (req, res) => {
  try {
    const today = new Date().toDateString();
    const { grade } = req.body;
    // console.log(grade);
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const auth = new google.auth.GoogleAuth({
      keyFile: "key.json", //the key file
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });
    // console.log("1");
    const authClientObject = await auth.getClient();
    const sheet = google.sheets({
      version: "v4",
      auth: authClientObject,
    });
    // console.log("2");

    const readData = await sheet.spreadsheets.values.get({
      auth, //auth object
      spreadsheetId, // spreadsheet id
      range: "Vevox Data!E:I", //range of cells to read from.
    });
    // console.log("3");

    const data = readData.data.values;
    const gradeData = data.filter((val) => val[4] === grade);
    const dateData = gradeData.filter((val) => {
      return new Date(val[1]).toDateString() === today;
    });
    // console.log("4");

    const finalData = [];
    for (let i = 0; i < dateData.length; i++) {
      const existingUser = finalData.find((val) => val[0] === dateData[i][0]);
      if (!existingUser) {
        finalData.push(dateData[i]);
      }
    }

    // console.log("5");

    res.send({
      totalParticipants: finalData.length,
    });
  } catch (error) {
    res.status(500).send({
      error,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server Started 🎈🎈");
});
