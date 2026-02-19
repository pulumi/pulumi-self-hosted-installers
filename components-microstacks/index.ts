import { OpenSearch } from "./openSearch";
import { 
    CertManager, 
    Certificate,
    AzureDNSClusterIssuer,
    AWSRoute53ClusterIssuer,
    GCPDNSClusterIssuer,
    CertManagerDeployment // Legacy compatibility
} from "./cert-manager";
import { 
    OpenSearchCertificates,
    OpenSearchCAIssuer 
} from "./openSearchCertificates";

export {
    OpenSearch,
    CertManager,
    Certificate,
    AzureDNSClusterIssuer,
    AWSRoute53ClusterIssuer,
    GCPDNSClusterIssuer,
    CertManagerDeployment,
    OpenSearchCertificates,
    OpenSearchCAIssuer
};