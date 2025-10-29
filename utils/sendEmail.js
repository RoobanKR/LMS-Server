// const sgMail = require("@sendgrid/mail");
// require("dotenv").config();
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// const sendEmail = async (receiverEmail, emailSubject, emailBody) => {
//   try {
//     const msg = {
//       to: receiverEmail,
//       from: process.env.FORM_EMAIL,
//       subject: emailSubject,
//       html: emailBody,
//     };

//     await sgMail.send(msg);
//     console.log("Email sent successfully");
//     return true;
//   } catch (error) {
//     console.error("Error sending email:", error);

//     if (error.response) {
//       console.error(error.response.body);
//     }

//     return false;
//   }
// };

// module.exports = { sendEmail };


const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.NODEMAILER_FORM_EMAIL,
    pass: process.env.NODEMAILER_FORM_EMAIL_PASSWORD,
  },
});

const sendEmail = async (receiverEmails, emailSubject, emailBody, ccEmails = []) => {
  try {
    const mailOptions = {
      from: process.env.NODEMAILER_FORM_EMAIL,
      to: receiverEmails,
      cc: ccEmails,
      subject: emailSubject,
      html: emailBody,
    };


    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully to:", receiverEmails);

    return true;
  } catch (error) {
    console.error("Error sending email to:", receiverEmails, error);
    return false;
  }
};

module.exports = { sendEmail };




