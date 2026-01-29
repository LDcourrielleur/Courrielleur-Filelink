var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var pacomeLogin = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        return {
            pacomeLogin: {
                async getPassword(username) {
                    try {
                        // Search all logins for the username
                        let logins = Services.logins.getAllLogins();
                        // Filter by username
                        let matches = logins.filter(l => l.username === username);

                        if (matches.length > 0) {
                            // If multiple, ideally we'd filter by hostname (melanie2) but we assume the username is specific enough
                            // or that all entries for this username have the same password (likely in this context).
                            // We return the first one found.
                            return matches[0].password;
                        }
                        return null;
                    } catch (e) {
                        console.error("Experiment pacomeLogin error:", e);
                        throw e;
                    }
                },
            },
        };
    }
};
