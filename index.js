const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");
require("dotenv").config();
const app = express();
app.use(express.json());
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
// enroll user to a batch ------------- https://wisechamps.app/webservice/rest/server.php?wstoken=2ae4c24bfc47f91187132239851605e3&wsfunction=

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

const getWeeklySchedule = async () => {
  let eventsOfTheWeek = [];
  const res = await axios.get(
    `${url}?wstoken=${wstoken}&wsfunction=core_course_get_courses_by_field&[options][ids]&moodlewsrestformat=json`
  );
  const data = res.data.courses;
  const filteredData = data.filter((response) => {
    return response.shortname.includes("Workshop");
  });
  const { startTime, endTime } = getTrailTime();
  for (let i = 0; i < filteredData.length; i++) {
    const courseID = filteredData[i].id;
    const event = await axios.get(
      `${url}?wstoken=${wstoken}&&wsfunction=core_calendar_get_calendar_events&events[courseids][0]=${courseID}&options[timestart]=${startTime}&options[timeend]=${endTime}&moodlewsrestformat=json`
    );
    let object = event.data;
    if (object.events.length > 0) {
      eventsOfTheWeek.push(object);
    }
  }
  return eventsOfTheWeek;
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
  const res = await axios.post(
    `${url}?wstoken=${wstoken}&wsfunction=${wsfunctionGetContent}&courseid=${courseId}&moodlewsrestformat=json`
  );
  return res.data;
};

app.get("/", (req, res) => {
  res.status(200).send({
    message: "Server Started",
  });
});

app.get("/getWeeklySchedule", async (req, res) => {
  try {
    const phone = req.query.phone;
    const finalWeeklyData = [];
    const getConfig = {
      headers: {
        Authorization: `Bearer ${WATI_TOKEN}`,
      },
    };
    const getData = await axios.get(
      `https://live-server-105694.wati.io/api/v1/getContacts?attribute=%5B%7Bname%3A%20%22phone%22%2C%20operator%3A%20%22contain%22%2C%20value%3A%20%22${phone}%22%7D%5D`,
      getConfig
    );
    if (!getData.data || getData.data.contact_list.length == 0) {
      return res.status(404).send({
        status: "User not found with this number",
      });
    }
    const result = getData.data.contact_list[0].customParams;
    let list_of_subjects = "",
      student_grade = "";
    for (let i = 0; i < result.length; i++) {
      if (result[i].name == "student_grade") {
        student_grade = result[i].value;
      } else if (result[i].name == "list_of_subjects") {
        list_of_subjects = result[i].value;
      }
    }
    const weeklyData = await getWeeklySchedule();
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
    if (list_of_subjects == "Math") {
      try {
        const cid = courseFormat[0][grade];
        const courseData = await getCourseContent(cid);
        courseData.map((res) => {
          const data = res.modules;
          if (data.length > 0) {
            for (let i = 0; i < data.length; i++) {
              for (let j = 0; j < weeklyData.length; j++) {
                let events = weeklyData[j].events;
                for (let k = 0; k < events.length; k++) {
                  if (weeklyData[j].events[k].instance == data[i].instance) {
                    let time = weeklyData[j].events[k].timestart - 2400;
                    finalWeeklyData.push({
                      subject: list_of_subjects,
                      name: res.name,
                      date: new Date(
                        weeklyData[j].events[k].timestart * 1000
                      ).toLocaleDateString(),
                      time,
                    });
                  }
                }
              }
            }
          }
        });
      } catch (error) {
        return res.status(500).send({
          error,
        });
      }
    } else if (list_of_subjects == "English") {
      try {
        const cid = courseFormat[1][grade];
        const courseData = await getCourseContent(cid);
        courseData.map((res) => {
          const data = res.modules;
          if (data.length > 0) {
            for (let i = 0; i < data.length; i++) {
              for (let j = 0; j < weeklyData.length; j++) {
                let events = weeklyData[j].events;
                for (let k = 0; k < events.length; k++) {
                  if (weeklyData[j].events[k].instance == data[i].instance) {
                    let time = weeklyData[j].events[k].timestart - 2400;
                    finalWeeklyData.push({
                      subject: list_of_subjects,
                      name: res.name,
                      date: new Date(
                        weeklyData[j].events[k].timestart * 1000
                      ).toLocaleDateString(),
                      time,
                    });
                  }
                }
              }
            }
          }
        });
      } catch (error) {
        return res.status(500).send({
          error,
        });
      }
    } else if (list_of_subjects == "Science") {
      try {
        const cid = courseFormat[2][grade];
        const courseData = await getCourseContent(cid);
        courseData.map((res) => {
          const data = res.modules;
          if (data.length > 0) {
            for (let i = 0; i < data.length; i++) {
              for (let j = 0; j < weeklyData.length; j++) {
                let events = weeklyData[j].events;
                for (let k = 0; k < events.length; k++) {
                  if (weeklyData[j].events[k].instance == data[i].instance) {
                    let time = weeklyData[j].events[k].timestart - 2400;
                    finalWeeklyData.push({
                      subject: list_of_subjects,
                      name: res.name,
                      date: new Date(
                        weeklyData[j].events[k].timestart * 1000
                      ).toLocaleDateString(),
                      time,
                    });
                  }
                }
              }
            }
          }
        });
      } catch (error) {
        return res.status(500).send({
          error,
        });
      }
    } else if (list_of_subjects == "GK") {
      try {
        const cid = courseFormat[3][grade];
        const courseData = await getCourseContent(cid);
        courseData.map((res) => {
          const data = res.modules;
          if (data.length > 0) {
            for (let i = 0; i < data.length; i++) {
              for (let j = 0; j < weeklyData.length; j++) {
                let events = weeklyData[j].events;
                for (let k = 0; k < events.length; k++) {
                  if (weeklyData[j].events[k].instance == data[i].instance) {
                    let time = weeklyData[j].events[k].timestart - 2400;
                    finalWeeklyData.push({
                      subject: list_of_subjects,
                      name: res.name,
                      date: new Date(
                        weeklyData[j].events[k].timestart * 1000
                      ).toLocaleDateString(),
                      time,
                    });
                  }
                }
              }
            }
          }
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
        for (x = 0; x < 4; x++) {
          const cid = courseFormat[x][grade];
          let subject = "";
          if (x == 0) {
            subject = "Math";
          } else if (x == 1) {
            subject = "English";
          } else if (x == 2) {
            subject = "Science";
          } else if (x == 3) {
            subject = "GK";
          }
          const courseData = await getCourseContent(cid);
          courseData.map((res) => {
            const data = res.modules;
            if (data.length > 0) {
              for (let i = 0; i < data.length; i++) {
                for (let j = 0; j < weeklyData.length; j++) {
                  let events = weeklyData[j].events;
                  for (let k = 0; k < events.length; k++) {
                    if (weeklyData[j].events[k].instance == data[i].instance) {
                      let time = weeklyData[j].events[k].timestart - 2400;
                      finalWeeklyData.push({
                        subject,
                        name: res.name,
                        date: new Date(
                          weeklyData[j].events[k].timestart * 1000
                        ).toLocaleDateString(),
                        time,
                      });
                    }
                  }
                }
              }
            }
          });
        }
      } catch (error) {
        return res.status(500).send({
          error,
        });
      }
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

cron.schedule("59 23 * * *", async () => {
  const data = await changeSubscriptionType();
  console.log(data);
});

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

const updatePointsInZoho = async (refereePhone, referralPhone) => {
  const token = await getZohoToken();
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
  const lead = await axios.get(
    `https://www.zohoapis.com/crm/v2/Contacts/search?phone=${referralPhone}`,
    config
  );
  const leadId = lead.data.data[0].id;
  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v2/Contacts/search?phone=${refereePhone}`,
    config
  );
  const contactId = contact.data.data[0].id;
  const referralCount = contact.data.data[0].Referral_Count;
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

const upadeScoreinZoho = async (phone, addScore) => {
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
  const engagementScore =
    deal.data.data[0].Engagement_Score != null
      ? Number(deal.data.data[0].Engagement_Score)
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

const getRegularLogin = async (data) => {
  const id = data.userid;
  const loggedinTime = data.timecreated;
  const res = await axios.get(
    `${URL}?wstoken=${WSTOKEN}&wsfunction=core_user_get_users_by_field&field=id&values[0]=${id}&moodlewsrestformat=json`
  );
  const firstaccess = res.data[0].firstaccess;
  const phone = res.data[0].phone1;
  const loggedDate = new Date(loggedinTime * 1000).toLocaleDateString();
  const firstDate = new Date(
    (Number(firstaccess) + 86400) * 1000
  ).toLocaleDateString();
  const secondDate = new Date(
    (Number(firstaccess) + 172800) * 1000
  ).toLocaleDateString();
  const thirdDate = new Date(
    (Number(firstaccess) + 259200) * 1000
  ).toLocaleDateString();
  const fourthDate = new Date(
    (Number(firstaccess) + 345600) * 1000
  ).toLocaleDateString();
  const fifthDate = new Date(
    (Number(firstaccess) + 432000) * 1000
  ).toLocaleDateString();
  let result = "";
  if (loggedDate == firstDate) {
    result = await upadeScoreinZoho(phone, 2);
  } else if (loggedDate == secondDate) {
    result = await upadeScoreinZoho(phone, 3);
  } else if (loggedDate == thirdDate) {
    result = await upadeScoreinZoho(phone, 5);
  } else if (loggedDate == fourthDate) {
    result = await upadeScoreinZoho(phone, 10);
  } else if (loggedDate == fifthDate) {
    result = await upadeScoreinZoho(phone, 20);
  }
  if (result == "") {
    return { status: "More than 5 Days" };
  }
  return result;
};

app.post("/regularLogin", async (req, res) => {
  try {
    const data = await getRegularLogin(req.body);
    return res.status(200).send({
      data,
    });
  } catch (error) {
    return res.status(500).send({
      error,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server Started 🎈🎈");
});
