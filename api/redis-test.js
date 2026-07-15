require('dotenv').config({ path: "../.env" });
const client = require('./redis');

client.ping()
    .then((res) => {
        console.log("success: ", res);
        client.quit();
    })
    .catch((err) => {
        console.error("error: ", err);
        client.quit();
    });