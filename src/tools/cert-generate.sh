#!/bin/bash
set -euo pipefail

NAME=""
NAMESPACE=""
DOMAIN=""
OUT_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      NAME="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    -*|--*)
      echo "Unknown option $1" >&2
      exit 1
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "Missing required argument: --name" >&2
  exit 1
fi
if [ -z "$NAMESPACE" ]; then
  echo "Missing required argument: --namespace" >&2
  exit 1
fi
if [ -z "$DOMAIN" ]; then
  echo "Missing required argument: --domain" >&2
  exit 1
fi

OUT_DIR="${OUT_DIR:-cert/${NAME}}"
mkdir -p "$OUT_DIR" && cd "$OUT_DIR"

# prepare openssl params
cat <<EOF > csr.conf
[req]
req_extensions = v3_req
distinguished_name = req_distinguished_name
[req_distinguished_name]
[ v3_req ]
keyUsage=keyEncipherment,dataEncipherment
extendedKeyUsage=serverAuth,clientAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${NAME}
DNS.2 = ${NAME}-headless
DNS.3 = ${NAME}.${NAMESPACE}
DNS.4 = ${NAME}-headless.${NAMESPACE}
DNS.5 = *.${NAME}-headless.${NAMESPACE}
DNS.6 = *.${NAMESPACE}.svc.${DOMAIN}
DNS.7 = *.${NAME}-headless.${NAMESPACE}.svc.${DOMAIN}
EOF

# generate CA key
openssl genrsa -out cakey.pem 4096
# generate CA cert (valid >= server cert)
openssl req -new -key cakey.pem -x509 \
  -nodes -sha256 \
  -days 3650 \
  -out cacert.pem \
  -subj "/C=US/ST=CA/L=Qdrant/OU=Operator/CN=MyCA"
# generate server key
openssl genrsa -out key.pem 2048
# generate and sign server cert
openssl req -nodes -sha256 -new -key key.pem \
  -subj "/C=US/ST=CA/L=Qdrant/OU=Operator/CN=${NAME}" \
  -config csr.conf \
  | openssl x509 -days 3650 -sha256 -req -CA cacert.pem -CAkey cakey.pem \
  -extensions v3_req -extfile csr.conf \
  -CAcreateserial -out cert.pem

echo -n "Certificates for \"${NAME}\" are ready!"
