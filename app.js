require('dotenv').config()
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const moment = require('moment')



const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.compose'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
let time = moment().unix()
let senderList = [] // Unique list of all the email addresses


// Check if saved credentials are present
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}


//after logging in, save the credentials
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}


//authorize function to call the google login OAuth
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}


// Function to add label to the sent mail
async function addLabel(gmail, messageId, labelId){
  try{
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  }catch(error){
    console.log(error)
  }
}


// Send vacation mail to senders
async function sendMail(gmail, _to){
  const subject = 'Current Status';
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
      `From: ${process.env.userName} <${process.env.emailFrom}>`,
      `To: ${_to} <${_to}>`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      'I am on a vacation, bugger off',
  ];
  const message = messageParts.join('\n');

  const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  try{
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
          raw: encodedMessage,
      },    
    });
    console.log(`Email sent to ${_to}`)
    return res.data.id
  } catch(error){
    console.log(error)
  }
}

// Get list of unique list of senders to whom the mail has to be sent
function getSenderEmail(headers){
  let email
  for(let i=headers.length-1; i>=0; i--){
      if(headers[i].name == 'From'){
          email = (/(?<=\<)(.*?)(?=\>)/g.exec(headers[i].value))[0]
          break
      }
  }
  return email
}


// generates the list of emails to whom the notification for vacation has to be sent, basically the 'main' function
async function getReceipients(auth){
  const gmail = google.gmail({version: 'v1', auth});
  let threadList = []
  let tempSenderList = []
  
  try{
    console.log('Checking for mail...')
    let res = await gmail.users.threads.list({userId: 'me', q: `is: unread after:${time}`}) // Get latest threads   
    time = moment().unix()   
    if((res.data.resultSizeEstimate) == 0){
      console.log('No new mails')
    } else {
      for(thread of res.data.threads){
        threadList.push(thread.id)
      }
      
      // Get list of emails to whom no replies have been sent by the yuser
      for(let id of threadList){
        let status = true
        let res = await gmail.users.threads.get({userId: 'me', id:id})
        for(msg of res.data.messages){
          if(msg.payload.headers[0].name != 'Delivered-To'){
            status = false
            break;
          }
        }
        if(status){
          tempSenderList.push(getSenderEmail(msg.payload.headers))
        }
      }
  
      // Send vacation mails and add those mails to a label caled 'Vacation Mail'
      for(_to of tempSenderList){
        if(!senderList.includes(_to)){
          senderList.push(_to)
          const msgID = await sendMail(gmail, _to)
          await addLabel(gmail, msgID, process.env.labelID)
        }
      }
    }
  } catch(error){
    console.log(error)
  }
}

authorize().then(auth => {
  setInterval(async() => {
    await getReceipients(auth)
  }, Math.floor(Math.random() * (120000 - 45000)) + 45000)  // Randomly check for new mail between 45 to 120 seconds
}).catch(error => {
  console.log(error)
})