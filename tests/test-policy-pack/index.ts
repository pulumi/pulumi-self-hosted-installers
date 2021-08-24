import * as random from "@pulumi/random";
import { PolicyPack, validateResourceOfType } from "@pulumi/policy";

// The first argument is the policy pack name and it's used in the integration test.
// It is intentionally kept the same as the folder name.
new PolicyPack("test-policy-pack", {
    policies: [{
        name: "strong-password",
        description: "Prohibits using passwords less than 12 characters in length.",
        enforcementLevel: "mandatory",
        validateResource: validateResourceOfType(random.RandomPassword, (rp, args, reportViolation) => {
            if (rp.length < 12) {
                reportViolation("Password must be longer than 12");
            }
        }),
    }],
});
