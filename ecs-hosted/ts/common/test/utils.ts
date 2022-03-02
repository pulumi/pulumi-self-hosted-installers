import "mocha";
import * as assert from "assert";

import { getIamPolicyArn } from "../utils";

describe("arn is changed for govcloud", function () {
    it("govcloud arn is changed for us west", function () {
        const region = "us-gov-west-1";
        const policyArn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";

        const policyOut = getIamPolicyArn(region, policyArn);

        assert.strictEqual(policyOut, "arn:aws-us-gov:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy");
    });

    it("govcloud arn is changed for us east", function () {
        const region = "us-gov-east-1";
        const policyArn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";

        const policyOut = getIamPolicyArn(region, policyArn);

        assert.strictEqual(policyOut, "arn:aws-us-gov:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy");
    });

    it("arn is not changed for non govcloud us west", function () {
        const region = "us-west-1";
        const policyArn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";

        const policyOut = getIamPolicyArn(region, policyArn);

        assert.strictEqual(policyOut, policyArn);
    });

    it("arn is not changed for non govcloud us east", function () {
        const region = "us-east-1";
        const policyArn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";

        const policyOut = getIamPolicyArn(region, policyArn);

        assert.strictEqual(policyOut, policyArn);
    });
});