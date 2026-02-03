var ExtensionCommon;
try {
    ({ ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs"));
} catch (e) {
    try {
        ({ ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm"));
    } catch (e2) {
        if (typeof ExtensionCommon === "undefined") {
            console.error("[Pacome Experiment] FATAL: ExtensionCommon not found!", e, e2);
        }
    }
}

var ExtensionParent;
try {
    ({ ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs"));
} catch (e) {
    try {
        ({ ExtensionParent } = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm"));
    } catch (e2) {
        console.error("[Pacome Experiment] ExtensionParent not found", e2);
    }
}


var Services;
try {
    ({ Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs"));
} catch (e) {
    try {
        ({ Services } = ChromeUtils.import("resource://gre/modules/Services.jsm"));
    } catch (e2) {
        if (typeof Services === "undefined") {
            console.error("[Pacome Experiment] FATAL: Services not found!");
        }
    }
}

var PacomeAuthUtils;
try {
    ({ PacomeAuthUtils } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeAuthUtils.mjs"));
} catch (e) {
    console.log("[Pacome Experiment] PacomeAuthUtils not found", e);
}

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

var pacomeLogin = class extends ExtensionCommon.ExtensionAPI {
    onStartup() {
        console.log("[Pacome Experiment] onStartup called");
    }

    getAPI(context) {
        const api = {
            pacomeLogin: {
                async getPassword(username) {
                    console.log(`[Pacome Experiment] getPassword called for: ${username}`);
                    try {
                        // Pacome stores passwords with specific origins and realms
                        // Extract realm from username (format: user.-.PARTAGE → realm: user)
                        let pacomeRealm = username.split(".-.")[0];
                        console.log(`[Pacome Experiment] Searching for realm: ${pacomeRealm}`);

                        // Try various origin patterns that Pacome might use
                        const origins = [
                            "imap://amelie.s2.m2.e2.rie.gouv.fr",
                            "https://amelie.s2.m2.e2.rie.gouv.fr",
                            "https://bnum.din.gouv.fr"
                        ];

                        for (let origin of origins) {
                            try {
                                // Try with specific realm
                                let logins = Services.logins.findLogins(origin, null, pacomeRealm);
                                if (logins.length > 0) {
                                    console.log(`[Pacome Experiment] Found password for ${username} via realm ${pacomeRealm} at ${origin}`);
                                    return logins[0].password;
                                }

                                // Try wildcard realm
                                logins = Services.logins.findLogins(origin, null, null);
                                let match = logins.find(l => l.username === username || l.username === pacomeRealm);
                                if (match) {
                                    console.log(`[Pacome Experiment] Found password for ${username} via wildcard at ${origin}`);
                                    return match.password;
                                }
                            } catch (e) { }
                        }

                        console.log(`[Pacome Experiment] No password found for ${username}`);
                        return null;
                    } catch (e) {
                        console.error("[Pacome Experiment] getPassword error:", e);
                        return null;
                    }
                },

                async createAccount(type, name) {
                    console.log(`[Pacome Experiment] createAccount called with type=${type}, name=${name}`);
                    try {
                        let cloudMgr = null;

                        // --- STRATEGY: ExtensionParent Probe ---
                        if (ExtensionParent && ExtensionParent.apiManager) {
                            try {
                                console.log("[Pacome Experiment] Probing ExtensionParent.apiManager...");
                                // apiManager has a Map of modules? or globalModules?
                                // Let's try to 'generate' the API to trigger loading if needed?
                                // No, browsing the loaded modules via the manager structure

                                // Note: Implementation varies by TB version.
                                // Often: ExtensionParent.apiManager.modules.get("cloudFile")

                                if (ExtensionParent.apiManager.modules) {
                                    if (ExtensionParent.apiManager.modules.has("cloudFile")) {
                                        console.log("[Pacome Experiment] ExtensionParent has 'cloudFile' module!");
                                        let mod = ExtensionParent.apiManager.modules.get("cloudFile");
                                        // Inspect the module proxy/obj
                                        console.log(`[Pacome Experiment] 'cloudFile' module keys: ${Object.keys(mod || {})}`);

                                        // Often the scope is hidden, but maybe an export?
                                        if (mod.CloudFileAccountManager) cloudMgr = mod.CloudFileAccountManager;
                                    }
                                } else {
                                    console.log("[Pacome Experiment] apiManager.modules is undefined. Trying globals...");
                                    // older TB?
                                }
                            } catch (e) { console.error("ExtensionParent probe failed", e); }
                        }

                        // --- STRATEGY: Manual Pref Write (The "Brute Force" Fallback) ---
                        if (!cloudMgr) {
                            console.warn("[Pacome Experiment] MANAGER NOT FOUND. Attempting Manual Preference Write...");

                            // 1. Generate a new Account Key
                            let newKey = "account" + Date.now();

                            // 2. Read existing accounts string
                            let existingAccounts = "";
                            try { existingAccounts = Services.prefs.getStringPref("mail.cloud_files.accounts"); } catch (e) { }

                            let accounts = existingAccounts ? existingAccounts.split(",") : [];
                            if (!accounts.includes(newKey)) {
                                accounts.push(newKey);

                                console.log(`[Pacome Experiment] Writing prefs for new account: ${newKey}`);
                                // 3. Write Prefs
                                Services.prefs.setStringPref("mail.cloud_files.accounts", accounts.join(","));
                                Services.prefs.setStringPref(`mail.cloud_files.account.${newKey}.type`, type);
                                Services.prefs.setStringPref(`mail.cloud_files.account.${newKey}.displayName`, name);

                                // Initialize standard default prefs for a cloud account if needed
                                // (e.g. oauth, settingsUrl, etc. - usually handled by the extension afterward)

                                console.log("[Pacome Experiment] SUCCESS (Manual Write). Account registered in prefs.");
                                return newKey;
                            } else {
                                console.log("[Pacome Experiment] Account key generation collision? Retrying not implemented.");
                                return newKey; // Assume it worked or existed
                            }
                        }

                        // Normal path (if manager found)
                        let key = cloudMgr.createAccount(type);
                        let account = cloudMgr.getAccount(key);
                        account.displayName = name;
                        return key;

                    } catch (e) {
                        console.error("[Pacome Experiment] Failed to create account:", e);
                        throw e;
                    }
                },

                async findCredentials() {
                    try {
                        let MailServices;
                        try { ({ MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs")); }
                        catch (e) { try { ({ MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm")); } catch (e2) { if (typeof ((window || this).MailServices) !== 'undefined') MailServices = (window || this).MailServices; } }

                        if (!MailServices) return null;

                        let allServers = MailServices.accounts.allServers;
                        for (let server of allServers) {
                            if (!server.username) continue;
                            let pacomeRealm = server.username.split(".-.")[0];
                            let logins = Services.logins.findLogins(`imap://${server.hostName}`, null, pacomeRealm);
                            if (logins.length > 0) return { username: logins[0].username, password: logins[0].password };
                        }
                        return null;
                    } catch (e) { return null; }
                }
            },
        };
        return api;
    }
};

var pacomeLogin = pacomeLogin;
if (typeof exports !== 'undefined') {
    exports.pacomeLogin = pacomeLogin;
}
