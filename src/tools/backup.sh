#!/bin/bash

mcli alias set S3 ${ENDPOINT_URL} ${ACCESS_KEY} ${SECRET_KEY}

CURRENT_TIME=$(date +"%Y-%m-%d-%H-%M")
BACKUP_DIR="${CLUSTER_NAME}/${COLLECTION_NAME}/${CURRENT_TIME}"
mkdir -p ${BACKUP_DIR}

for ((i=0;i<REPLICAS;++i)); do
  QDRANT_ENDPOINT="${CONNECTION_METHOD}://${CLUSTER_NAME}-${i}.${CLUSTER_NAME}-headless.${NAMESPACE}:6333"
  RESULT=$(curl -k -s -X POST -H "api-key: ${API_KEY}" "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots")
  SNAPSHOT_NAME=$(echo $RESULT| jq -r .result.name)
  if [ -n "$SNAPSHOT_NAME" ]; then
    curl -k -s -H "api-key: ${API_KEY}" \
      "${QDRANT_ENDPOINT}/collections/${COLLECTION_NAME}/snapshots/${SNAPSHOT_NAME}" \
      -o ${BACKUP_DIR}/${CLUSTER_NAME}-$i.snapshot
    echo "Saved ${BACKUP_DIR}/${CLUSTER_NAME}-${i}.snapshot"
  else
    echo "Something went wrong on ${QDRANT_ENDPOINT}."
    echo $(echo $RESULT| jq .)
    exit 1
  fi
done

mcli mirror ${BACKUP_DIR} S3/${BUCKET_NAME}/${BACKUP_DIR}
echo "Successfully stored \"${COLLECTION_NAME}\" backup in the \"${BUCKET_NAME}\" bucket."
echo "Snapshot name is \"${BACKUP_DIR}\"."

