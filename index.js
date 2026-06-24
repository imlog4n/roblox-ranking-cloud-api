require("dotenv").config();

const express = require("express");
const app = express();
const noblox = require("noblox.js");

app.use(express.json());

app.get("/", (req, res) => {
    res.sendStatus(200);
})

app.post("/setrank", authorize, async (req, res) => {
    const userId = req.body.UserId;
    const rankerUserId = req.body.RankerUserId;
    const roles = await noblox.getRoles(process.env.GROUP_ID);
    const newRank = roles.find(role => role.id == req.body.NewRankId);
    const result = await setRank(userId, newRank.id);

    res.sendStatus(result.res.ok ? 200 : 500);
})

app.post("/promote", authorize, async (req, res) => {
    const userId = req.body.UserId;
    const rankerUserId = req.body.RankerUserId;
    const currentRank = await noblox.getRankInGroup(process.env.GROUP_ID, userId);
    const roles = await noblox.getRoles(process.env.GROUP_ID);

    roles.sort((a, b) => a.rank - b.rank);

    const currentIndex = roles.findIndex(role => role.rank == currentRank);
    const nextRole = roles[currentIndex + 1];

    if (!nextRole || currentIndex < 0) {
        return res.sendStatus(400);
    }

    const result = await setRank(userId, rankerUserId, nextRole.id);

    res.sendStatus(result.res.ok ? 200 : 500);
})

app.post("/demote", authorize, async (req, res) => {
    const userId = req.body.UserId;
    const rankerUserId = req.body.RankerUserId;
    const currentRank = await noblox.getRankInGroup(process.env.GROUP_ID, userId);
    const roles = await noblox.getRoles(process.env.GROUP_ID);

    roles.sort((a, b) => a.rank - b.rank);

    const currentIndex = roles.findIndex(role => role.rank == currentRank);
    const prevRole = roles[currentIndex - 1];

    if (!prevRole) {
        return res.sendStatus(400);
    }

    const result = await setRank(userId, rankerUserId, prevRole.id);

    res.sendStatus(result.res.ok ? 200 : 500);
})

async function setRank(userId, rankerUserId, roleId) {
    const membershipUrl = `https://apis.roblox.com/cloud/v2/groups/${process.env.GROUP_ID}/memberships?filter=${encodeURIComponent(`user == 'users/${userId}'`)}`;
    const membershipRes = await fetch(membershipUrl, {
        headers: {
            "x-api-key": process.env.CLOUD_API_KEY,
            "Content-Type": "application/json"
        }
    })
    const membershipData = await membershipRes.json();

    if (!membershipRes.ok || !membershipData.groupMemberships?.length) {
        console.error(membershipRes, membershipData);

        return { res: membershipRes, data: membershipData };
    }

    const fullMembership = membershipData.groupMemberships[0].path;
    const membershipId = fullMembership.split("/").pop();
    const url = `https://apis.roblox.com/cloud/v2/groups/${process.env.GROUP_ID}/memberships/${membershipId}`;
    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            "x-api-key": process.env.CLOUD_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: `groups/${process.env.GROUP_ID}/roles/${roleId}` })
    })
    const data = await res.json();

    if (!res.ok) {
        console.error(res, data);
    }

    await logToDiscord(userId, rankerUserId, membershipData.groupMemberships[0].role.id);

    return { res, data };
}

async function authorize(req, res, next) {
    const userId = req.body.UserId;
    const rankerUserId = req.body.RankerUserId;
    const userRank = await noblox.getRankInGroup(process.env.GROUP_ID, userId);
    const rankerRank = await noblox.getRankInGroup(process.env.GROUP_ID, rankerUserId);

    if (req.headers.authorization != process.env.API_KEY || userRank >= rankerRank || rankerRank < process.env.MIN_RANK) {
        return res.sendStatus(401);
    }

    next();
}

async function logToDiscord(userId, rankerUserId, oldRole) {
    if (!process.env.DISCORD_WEBHOOK) return;

    await fetch(process.env.DISCORD_WEBHOOK, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            embeds: [{
                title: "Rank Change",
                description: `**@${await noblox.getUsernameFromId(userId)}** was ranked from *${(await noblox.getRole(process.env.GROUP_ID, oldRole)).name}* to *${(await noblox.getRole(await noblox.getRankInGroup(process.env.GROUP_ID, userId))).name}* by **@${await noblox.getUsernameFromId(rankerUserId)}**`
            }]
        })
    })
}

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

app.listen(process.env.PORT || 3000, () => {
    console.log("Server is running on port " + (process.env.PORT || 3000));
})