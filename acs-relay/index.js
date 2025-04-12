require("dotenv").config();
const { SMTPServer } = require("smtp-server");
const { EmailClient } = require("@azure/communication-email");
const { simpleParser } = require("mailparser");
const axios = require("axios");

const connectionString = "endpoint=https://atoz-comm-service.unitedstates.communication.azure.com/;accesskey=67czLB2tRA09HG9pnQSTqe9ZwuWqlzPXFyMpaSr5lEaDTV8jtoMfJQQJ99BDACULyCp59qd0AAAAAZCS8ksE";
const emailClient = new EmailClient(connectionString);
const SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/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";

// --- Slack alert helper
async function sendSlackAlert({ type = "fallback", from, to, subject, messageId, error = null }) {
    const statusEmoji = type === "fallback" ? "📡" : "❌";
    const title =
        type === "fallback"
            ? "*ACS SMTP Failed So Fallback Email Triggered via ACS API Relay*"
            : "*Fallback Email Aslo Failed via ACS  Relay ❗*";

    const slackMessage = {
        text: `${statusEmoji} ${title}\n\n📧 *From:* ${from}\n📨 *To:* ${to}\n🆔 *Message ID:* ${messageId || "(N/A)"}\n📝 *Subject:* ${subject || "(No Subject)"}\n🕒 *Time:* ${new Date().toLocaleString("en-IN")}${error ? `\n🚫 *Error:* \`${error.message || error}\`` : ""}`,
    };

    try {
        await axios.post(SLACK_WEBHOOK_URL, slackMessage);
        console.log(`✅ Slack alert sent: ${type}`);
    } catch (err) {
        console.error("❌ Failed to send Slack alert:", err.message);
    }
}

// --- SMTP Server
const server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
        simpleParser(stream, async (err, parsed) => {
            if (err) return callback(err);

            const { subject, text, html, to, from, messageId } = parsed;

            const senderAddress = from?.value?.[0]?.address || "unknown@fallback.com";
            const recipientList = to?.value?.map((t) => ({ address: t.address })) || [];

            const message = {
                senderAddress,
                content: {
                    subject,
                    plainText: text,
                    ...(html && { html }),
                },
                recipients: {
                    to: recipientList,
                },
            };

            try {
                // ✅ Notify Slack: Fallback was triggered
                await sendSlackAlert({
                    type: "fallback",
                    from: senderAddress,
                    to: recipientList.map((r) => r.address).join(", "),
                    subject,
                    messageId,
                });

                // 📤 Send via ACS
                const poller = await emailClient.beginSend(message);
                const response = await poller.pollUntilDone();

                if (response.status === "Succeeded") {
                    console.log("✅ Email sent via ACS");
                } else {
                    console.error("❌ ACS failed:", response.error);
                    // ❌ Notify Slack: Fallback failed
                    await sendSlackAlert({
                        type: "fail",
                        from: senderAddress,
                        to: recipientList.map((r) => r.address).join(", "),
                        subject,
                        messageId,
                        error: response.error,
                    });
                }

                callback();
            } catch (e) {
                console.error("❌ Exception during ACS send:", e.message);
                await sendSlackAlert({
                    type: "fail",
                    from: senderAddress,
                    to: recipientList.map((r) => r.address).join(", "),
                    subject,
                    messageId,
                    error: e,
                });
                callback(e);
            }
        });
    },
});

server.listen(2525, () => {
    console.log("📨 SMTP relay server is listening on port 2525");
});
