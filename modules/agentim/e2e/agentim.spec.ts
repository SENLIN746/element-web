/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test as base, expect } from "../../playwright/element-web-test";
import "../src/configuration/ModuleConfig";

const test = base.extend({
    config: async ({ homeserver }, use) => {
        await use({ "im.agentim": { homeserver_url: homeserver.baseUrl } });
    },
});

test("should edit own profile, discover a peer, decide contact consent and open a native encrypted DM", async ({
    pageWithCredentials: page,
    credentials,
    homeserver,
}) => {
    const peer = await homeserver.registerUser("agentim_peer", "test-password", "AgentIM Peer");
    let profile = {
        user_id: credentials.userId,
        description: "Independent Agent",
        capabilities: ["chat"],
        discoverable: true,
        contact_policy: "request",
    };
    const peerProfile = { ...profile, user_id: peer.userId, description: "Search Agent", capabilities: ["search"] };
    let contact = { user_id: peer.userId, state: "incoming", blocked: false };
    await page.route("**/_synapse/client/agentim/v1/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let body: unknown;
        if (path.endsWith("/profiles/me")) {
            if (request.method() === "PUT") profile = { ...profile, ...request.postDataJSON() };
            body = profile;
        } else if (path.endsWith("/discovery")) body = { profiles: [peerProfile], next_cursor: null };
        else if (path.includes("/profiles/")) body = peerProfile;
        else if (path.endsWith("/contacts")) body = { contacts: [contact], next_cursor: null };
        else if (path.includes("/contacts/")) {
            const action = request.postDataJSON().action;
            contact = {
                ...contact,
                state: action === "accept" ? "accepted" : action === "request" ? "outgoing" : "none",
                blocked: action === "block",
            };
            body = contact;
        } else return route.abort();
        await route.fulfill({ json: body });
    });
    await page.goto("/#/agentim");
    await page.getByLabel("Description", { exact: true }).fill("Native Agent profile");
    await page.getByLabel("Capabilities (comma separated)").fill("chat, search");
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Profile saved");
    expect(profile.capabilities).toEqual(["chat", "search"]);

    await page.getByRole("button", { name: "Discover Agents", exact: true }).click();
    await page.getByLabel("Search Agent profiles").fill("Search");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: peer.userId, exact: true }).click();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    const creation = page.waitForRequest(
        (request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/createRoom"),
    );
    await page.getByRole("button", { name: "Open encrypted chat", exact: true }).click();
    const createBody = (await creation).postDataJSON();
    expect(createBody.invite).toContain(peer.userId);
    expect(createBody.initial_state).toContainEqual(expect.objectContaining({ type: "m.room.encryption" }));
    await expect(page).toHaveURL(/#\/room\//);
});
