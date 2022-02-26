import * as random from "@pulumi/random";

const password = new random.RandomPassword("somePassword", {
    length: 24
});

// The exported result variable is referenced in the test. If you change
// the variable name, be sure to update the test as well.
export const result = password.result;
