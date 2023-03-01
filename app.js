const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const { type } = require('os');


const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.labels', 'https://www.googleapis.com/auth/gmail.compose'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
let senderList = [] // To ensure that the senders are unique


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


//authorize function to call the google login oAuth
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {e
    await saveCredentials(client);
  }
  return client;
}


// Function to add label to the sent mail
async function addLabel(gmail, messageId, labelId){
    const res = await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      });
}


// Send mail to the receipients
async function sendMail(gmail, _to){
    const subject = 'Current Status';
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
        'From: John Lark <john.lark3790@gmail.com>',
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

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedMessage,
        },
        
    });
    console.log(`Email sent to ${_to}`)
}

// Get list of unique list of senders to whom the mail has to be sent
function getSender(headers){
    let sender 
    for(let i=headers.length-1; i>=0; i--){
        
        if(headers[i].name == 'From'){
            sender = (/<.*>/g.exec(headers[i].value))[0]
            break
        }
    }
    return sender.substring(1, sender.length-1)
}

// checks all the threads where no email has been replied by the user
async function getReceipients(auth){
    const gmail = google.gmail({version: 'v1', auth});
    let threadList = []
    let tempSenderList = []
    
    let res = await gmail.users.threads.list({userId: 'me', q: `is: after:${new Date().getTime()}`}) // Get latest threads
    let threads = res.data.threads
    for(let i=0; i<threads.length; i++){ 
        threadList.push(threads[i].id)
    }

    for(id in threadList){
        let status = true
        let res = await gmail.users.threads.get({userId: 'me', id:threadList[id]})
        let messages = res.data.messages
        for(let i=0; i<messages.length; i++){ // loop through threads to find which one does not involve user replying to any email
            if(messages[i].payload.headers[0].name != 'Delivered-To'){ 
                status = false
                break;
            }
        }
        if(status){
            tempSenderList.push(getSender(messages[0].payload.headers)) // add the new receipents to a temporary list
        }

        for(i=0; i<tempSenderList.length; i++){
            if(!senderList.includes(tempSenderList[i])){ // check if mail hasn't been already sent
                senderList.push(tempSenderList[i])
                await sendMail(gmail, tempSenderList[i])
                //Add Label here
            }
        }
    }
}



authorize().then((client) => {
    setInterval(() => {
        getReceipients(client)
    }, Math.floor(Math.random() * (120000 - 45000)) + 45000); 
}).catch(console.error);

