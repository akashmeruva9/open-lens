#!/usr/bin/env bash
# One-time GCP setup for OpenLens. Usage: PROJECT_ID=my-project ./infra/setup.sh
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
BUCKET="${PROJECT_ID}-openlens-media"
SA="openlens-api@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com \
  generativelanguage.googleapis.com youtube.googleapis.com fcm.googleapis.com logging.googleapis.com \
  cloudtasks.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com

gcloud artifacts repositories describe openlens --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create openlens --repository-format=docker --location="$REGION"

gcloud firestore databases describe >/dev/null 2>&1 || gcloud firestore databases create --location="$REGION"

gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || {
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
  # Published media must be publicly readable (Instagram/Facebook fetch video by URL).
  gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member=allUsers --role=roles/storage.objectViewer
  gcloud storage buckets update "gs://$BUCKET" --cors-file=<(echo '[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type","Range"],"maxAgeSeconds":3600}]')
}

gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create openlens-api --display-name="OpenLens API"
for role in roles/datastore.user roles/storage.objectAdmin roles/aiplatform.user roles/secretmanager.secretAccessor \
            roles/firebase.sdkAdminServiceAgent roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$role" --condition=None >/dev/null
done

if ! gcloud secrets describe gemini-api-key >/dev/null 2>&1; then
  echo "Create the Gemini key secret:  printf %s \"\$GEMINI_API_KEY\" | gcloud secrets create gemini-api-key --data-file=-"
fi
echo "Done. Deploy with: gcloud builds submit --config infra/cloudbuild.yaml ."
