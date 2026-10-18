# Pipo, a talking robot friend for Zoe

Zoe taps the big button, talks, and Pipo answers out loud in English or French.
The picture buttons (family photos and simple words) let her talk to Pipo even when
the microphone doesn't understand her.

## What's in this folder

- `server.js`: a small web server. It shows the app, checks the family code, and sends Zoe's words to Claude with child-safe instructions. Change the family names at the top of this file.
- `public/index.html`: the Pipo app (robot, microphone button, picture buttons, conversation log for parents).
- `public/login.html`: asks for the family code once per device.
- `public/photos/`: the family photos. They are only shown after the family code is entered.

No packages to install. It needs Node.js 18 or newer.

## 1. Get a Claude API key

1. Go to https://console.anthropic.com and sign in.
2. Add a small amount of credit under Billing, and set a monthly spend limit (for example $10).
   Pipo uses a small, fast model with very short answers, so each exchange costs a fraction of a cent.
3. Create an API key under API keys and copy it. Keep it private.

## 2. Try it on your computer (optional)

```
ACCESS_CODE=2468 ANTHROPIC_API_KEY=sk-ant-... node server.js
```

Open http://localhost:3000 in Chrome, enter 2468, and tap the button.

## 3. Put it online so the iPad can reach it

The iPad only allows the microphone on a secure (https) website, so host Pipo on a service
that gives you an https address. Render is one simple option:

1. Create a **private** repository on GitHub and upload everything in this folder.
2. On https://render.com, choose **New → Web Service** and connect that repository.
3. Settings: Runtime **Node**, Build command `npm install`, Start command `npm start`.
4. Under **Environment**, add:
   - `ANTHROPIC_API_KEY`: your key
   - `ACCESS_CODE`: a family code you choose (not a birthday)
5. Create the service. Render gives you an address like `https://pipo-abcd.onrender.com`.

Check Render's current plans: on a free plan the app may go to sleep when unused and take
about a minute to wake up on the first visit.

## 4. Put Pipo on Zoe's iPad

1. Open **Safari** on the iPad and go to your Render address.
2. Enter the family code. The iPad remembers it.
3. Tap the **Share** button, then **Add to Home Screen**, then **Add**. Pipo now has its own icon.
4. Open Pipo from the home screen and tap the big button once to wake Pipo up.
   When the iPad asks to use the microphone, tap **Allow**.
5. If Pipo can't hear: go to Settings › General › Keyboard and turn on **Enable Dictation**,
   and check Settings › Safari › Microphone.
6. Optional, to keep Zoe inside Pipo: Settings › Accessibility › **Guided Access**, turn it on and
   set a passcode. Open Pipo and triple-click the top (or home) button to lock the iPad to it.

## Safety notes

- Pipo's rules are in `systemPrompt()` in `server.js`: short, gentle answers; safe topics only;
  never asks for personal details; sends Zoe to Mom or Dad if she is hurt, scared or sad.
- Zoe's words go to Apple's speech recognition and to the Claude API to make Pipo answer.
  Use Pipo with an adult nearby, and read the "Conversation (for parents)" section now and then.
- `DAILY_LIMIT` (default 400 answers) stops runaway use.
- Speech recognition often mishears young children. If Zoe gets frustrated, use the picture buttons.
