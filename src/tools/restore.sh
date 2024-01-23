#!/bin/bash

mcli alias set S3 ${ENDPOINT_URL} ${ACCESS_KEY} ${SECRET_KEY}

mcli mirror S3/${BUCKET_NAME}/${SNAPSHOT_NAME} ${SNAPSHOT_NAME}/

cd ${SNAPSHOT_NAME}

for x in *.snapshot; do 
  NODE_NAME=${x%.snapshot}
  QDRANT_ENDPOINT="${CONNECTION_METHOD}://${NODE_NAME}.${CLUSTER_NAME}-headless.${NAMESPACE}:6333"
  RESULT=$(curl -k -s -H "api-key: ${API_KEY}" \
    "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots/upload?priority=snapshot" \
    -H "Content-Type:multipart/form-data" \
    -F "snapshot=@${x}")
      TIME=$(echo $RESULT| jq .time)
  if [ -n "$TIME" ]; then
    echo "Snapshot ${x} restored successfully in time ${TIME}."
  else
    echo "Something went wrong on ${NODE_NAME}."
    echo $(echo $RESULT| jq .)
    exit 1
  fi
done
