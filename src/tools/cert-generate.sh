#!/bin/bash
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      NAME="$2"
      shift
      shift
      ;;
    --namespace)
      NAMESPACE="$2"
      shift
      shift
      ;;
    --domain)
      DOMAIN="$2"
      shift
      shift
      ;;
    -*|--*)
      echo "Unknown option $1"
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done
set -- "${POSITIONAL_ARGS[@]}"

if [ -z "$NAME" ]; then
  echo "Please set cluster name using the --name arg"
  exit 1
fi
if [ -z "$NAMESPACE" ]; then
  echo "Please set namespace using the --namespace arg"
  exit 1
fi
if [ -z "$DOMAIN" ]; then
  echo "Please set K8S cluster domain name using the --domain arg"
  exit 1
fi

mkdir -p cert/${NAME} && cd cert/${NAME}

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
EOF

# generate CA key
openssl genrsa -out cakey.pem 4096 2>/dev/null
# generate CA cert
openssl req -new -key cakey.pem -x509 \
  -nodes -sha256 \
  -days 1000 \
  -out cacert.pem \
  -subj "/C=US/ST=CA/L=Qdrant/OU=Operator/CN=MyCA" 2>/dev/null
# generate server key
openssl genrsa -out key.pem 2048 2>/dev/null
# generate and sign server cert
openssl req -nodes -sha256 -new -key key.pem \
  -subj "/C=US/ST=CA/L=Qdrant/OU=Operator/CN=${NAME}" \
  -config csr.conf \
  | openssl x509 -days 3650 -sha256 -req -CA cacert.pem -CAkey cakey.pem \
  -extensions v3_req -extfile csr.conf \
  -CAcreateserial -out cert.pem 2>/dev/null

echo -n "Certificates for \"${NAME}\" are ready!"

