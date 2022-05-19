# Helper script to create self-signed certs for the API and Console endpoints 
if [ $# -ne 1 ]
then
  echo "Usage: $0 DOMAIN"
  echo "Example: $0 pulumi.example.com"
  exit 1
fi
api_name="api.${1}"
app_name="app.${1}"

echo "Generating certs for ${api_name}" 
openssl \
req -x509 -newkey rsa:4096 -keyout api.key.pem -out api.cert.pem \
-days 365 -nodes -subj "/CN=${api_name}" \
-addext "subjectAltName = DNS:${api_name}"

echo ""
echo "Generating certs for ${app_name}" 
openssl \
req -x509 -newkey rsa:4096 -keyout app.key.pem -out app.cert.pem \
-days 365 -nodes -subj "/CN=${app_name}" \
-addext "subjectAltName = DNS:${app_name}"