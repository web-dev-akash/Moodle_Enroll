const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");
require("dotenv").config();
const app = express();
app.use(express.json());
const url = `https://wisechamps.app/webservice/rest/server.php`;
const watiAPI = `https://live-server-105694.wati.io`;
const token = process.env.WATI_TOKEN;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PORT = process.env.PORT || 8080;
// console.log(JWT_SECRET);
// const timeConvertor = (timestamp) => {
//   dateObj = new Date(timestamp * 1000);
//   utcString = dateObj.toLocaleTimeString("en-US");
//   // time = utcString.slice(-11, -4);
//   return utcString;
// };

// enroll user to a batch ------------- https://wisechamps.app/webservice/rest/server.php?wstoken=2ae4c24bfc47f91187132239851605e3&wsfunction=

const courseFormat = [
  {
    G4: "420",
    G5: "421",
    G6: "422",
  },
  {
    G4: "424",
    G5: "425",
    G6: "426",
  },
  {
    G4: "427",
    G5: "428",
    G6: "429",
  },
  {
    G4: "430",
    G5: "431",
    G6: "432",
  },
];
const wstoken = process.env.WSTOKEN;
const wsfunctionCreate = "core_user_create_users";
const wsfunctionEnrol = "enrol_manual_enrol_users";
const wsfunctionGetContent = "core_course_get_contents";
const password = "wise@123";

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
  start.setUTCHours(0, 0, 0, 0);

  let end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  let startTime = Math.floor(start.valueOf() / 1000);
  let endTime = Math.floor(end.valueOf() / 1000) + 604800;
  return {
    startTime,
    endTime,
  };
};

const getPaidTime = () => {};

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

app.get("/weeklySchedule", async (req, res) => {
  try {
    const data = await getWeeklySchedule();
    return res.status(200).send({
      status: "success",
      data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: "error",
      error,
    });
  }
});

const createUser = async ({
  email,
  firstname,
  lastname,
  phone,
  subscription,
}) => {
  const res = await axios.post(
    `${url}?wstoken=${wstoken}&wsfunction=${wsfunctionCreate}&users[0][username]=${email}&users[0][password]=${password}&users[0][firstname]=${firstname}&users[0][lastname]=${lastname}&users[0][email]=${email}&users[0][phone1]=${phone}&users[0][customfields][0][type]=live_quiz_subscription&users[0][customfields][0][value]=${subscription}&moodlewsrestformat=json`
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

app.post("/getCourseContent", async (req, res) => {
  try {
    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).send({
        status: "error",
        message: "Incomplete Data",
      });
    }
    const weeklyData = await getWeeklySchedule();
    const courseData = await getCourseContent(courseId);
    const finalWeeklyData = [];
    courseData.map((res) => {
      const data = res.modules;
      if (data.length > 0) {
        for (let i = 0; i < data.length; i++) {
          for (let j = 0; j < weeklyData.length; j++) {
            if (weeklyData[j].events[0].instance == data[i].instance) {
              finalWeeklyData.push({
                name: res.name,
                date: new Date(
                  weeklyData[j].events[0].timestart * 1000
                ).toLocaleDateString(),
              });
            }
          }
        }
      }
    });

    // if (data.errorcode) {
    //   return res.status(404).send({
    //     status: "error",
    //     message: "Course not found",
    //   });
    // }
    return res.status(200).send({
      status: "success",
      finalWeeklyData,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      status: "error",
      error,
    });
  }
});

app.post("/createUser", authMiddleware, async (req, res) => {
  try {
    const { email, phone, student_name, student_grade } = req.body;
    const firstname = student_name.split(" ")[0];
    let lastname = student_name.split(" ")[1];
    if (lastname.length == 0) {
      lastname = ".";
    }
    const newUser = await createUser({
      email,
      firstname,
      lastname,
      phone,
      subscription: "Trail",
    });
    let grade = "";
    if (student_grade.includes("4")) {
      grade = "G4";
    } else if (student_grade.includes("5")) {
      grade = "G5";
    } else {
      grade = "G6";
    }
    const { startTime, endTime } = getTrailTime();
    // console.log(newUser);
    const uid = newUser[0].id;
    for (i = 0; i < 4; i++) {
      const cid = courseFormat[i][grade];
      await enrolUserToCourse({
        courseId: cid,
        timeStart: startTime,
        timeEnd: endTime,
        userId: uid,
      });
    }
    res.status(200).send({
      newUser,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      status: error,
    });
  }
});

app.post("/webhook", authMiddleware, async (req, res) => {
  const data = req.body;
  if (!data.email || !data.name || !data.phone) {
    return res.status(400).send({
      result: "error",
      status: "Incomplete Data",
    });
  } else {
    try {
      // const response = await createUser({email : data.email, firstname, lastname, phone : data.phone})
      // console.log(response);
      return res.status(200).send({
        result: "success",
        // data : response
      });
    } catch (error) {
      console.log("User already exists");
      return res.status(400).send({
        result: "error",
        status: "User already exists",
      });
    }
  }
});

app.post("/refer", async (req, res) => {
  const data = req.body;
  // ----------- If the client is interested in referring someone, update the contact with a new refer attribute.-------------------
  // data.refer = "Interested";

  // ------------ Ask for referree's name---------------.
  // data.referralName = "Akash 2";
  const student_name = data.student_name;
  const referree_name = data.referree_name;
  const phone = data.phone;

  const text = `My%20friend%20${data.student_name}%20${phone}%20challenged%20me%20for%20a%20live%20quiz%20${data.referree_name}`;

  const referral_link = `https://api.whatsapp.com/send?phone=+919717094422&text=${text}`;
  // const link = await shortUrl(referral_link)
  // const link = truncateUrl(referral_link, 25);
  // const urlObj = new URL(referral_link);
  // console.log(link)
  // const newlink = referral_link.slice(0, 10);
  // console.log(link)
  const referralData = [
    {
      customParams: [
        {
          name: "name",
          value: student_name,
        },
        {
          name: "referree_name",
          value: referree_name,
        },
        {
          name: "referral_link",
          value: link,
        },
      ],
      whatsappNumber: phone,
    },
  ];

  // const templateMessage = `HI Akash, ${referral_link}`

  const body = {
    broadcast_name: "referral_test",
    receivers: referralData,
    template_name: "referral_testing",
  };

  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/json",
    },
    body: JSON.stringify(body),
  };
  // fetch(`${watiAPI}/api/v1/sendTemplateMessages`, options)
  //   .then((res) => res.json())
  //   .then((res) => {
  //     console.log(res);
  //   });

  return res.send({
    referral_link,
  });
});

app.listen(PORT, () => {
  console.log("Server Started at http://localhost:8080");
});
