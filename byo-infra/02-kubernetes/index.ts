import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes"; 
import {config} from "./config";
import {NginxIngress} from "./helm-nginx-ingress";

export const kubeconfig = config.kubeconfig;

const provider = new k8s.Provider("k8s-provider", {
    kubeconfig,
});

const ingress = new NginxIngress("pulumi-selfhosted", {
    provider,
});

export const ingressNamespace = ingress.IngressNamespace;
export const ingressServiceIp = ingress.IngressServiceIp;
export const stackName2 = config.stackName;
