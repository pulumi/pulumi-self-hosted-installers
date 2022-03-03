import * as pulumi from "@pulumi/pulumi";

export function writeFileSync(outputVal: pulumi.Output<any>, filePath: string) {
    outputVal.apply(it => require("fs").writeFileSync(filePath, it));
}

export function createSha(outputVal: pulumi.Output<any>): pulumi.Output<any> {
    return outputVal.apply(it => require("crypto").createHash("sha1").update(it).digest('hex'));
}
