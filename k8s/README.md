# Kubernetes Deployment

## Access model

- Frontend is exposed on NodePort `30180`
- Backend is internal-only through the `learning-engine-backend` ClusterIP service
- Expected LAN URL:
  - `http://<minipc-or-node-ip>:30180`

The frontend nginx container proxies `/api` to the backend service, so normal browser traffic stays same-origin.

## Images

Use these image names and tags:

- `local-learning-engine-backend:0.1.0-k3s`
- `local-learning-engine-frontend:0.1.0-k3s`

Build them from the repository root:

```bash
docker build -t local-learning-engine-backend:0.1.0-k3s -f backend/Dockerfile .
docker build -t local-learning-engine-frontend:0.1.0-k3s -f frontend/Dockerfile --build-arg VITE_API_BASE_URL=/api .
```

If your k3s cluster uses containerd directly, import the images on the minipc node:

```bash
docker save local-learning-engine-backend:0.1.0-k3s | sudo k3s ctr images import -
docker save local-learning-engine-frontend:0.1.0-k3s | sudo k3s ctr images import -
```

If you prefer a registry, retag and push them first:

```bash
docker tag local-learning-engine-backend:0.1.0-k3s <registry>/local-learning-engine-backend:0.1.0-k3s
docker tag local-learning-engine-frontend:0.1.0-k3s <registry>/local-learning-engine-frontend:0.1.0-k3s
docker push <registry>/local-learning-engine-backend:0.1.0-k3s
docker push <registry>/local-learning-engine-frontend:0.1.0-k3s
```

If you push to a registry, update the image names in the deployment manifests before applying them.

## Secrets

Do not commit real secrets. Either copy `k8s/secret.example.yaml` and apply a local-only edited version, or create the secret directly:

```bash
kubectl -n learning-engine create secret generic learning-engine-secrets \
  --from-literal=JWT_SECRET_KEY='replace-with-a-long-random-secret'
```

Optional bootstrap admin credentials can be added later as extra env vars in `backend-deployment.yaml` if you want the first admin user created automatically.

## Apply order

Apply the manifests in this order:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl -n learning-engine create secret generic learning-engine-secrets \
  --from-literal=JWT_SECRET_KEY='replace-with-a-long-random-secret'
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
```

## Verification

```bash
kubectl -n learning-engine get pods
kubectl -n learning-engine get svc
kubectl -n learning-engine get pvc
kubectl -n learning-engine rollout status deploy/learning-engine-backend
kubectl -n learning-engine rollout status deploy/learning-engine-frontend
kubectl -n learning-engine logs deploy/learning-engine-backend
kubectl -n learning-engine logs deploy/learning-engine-frontend
```

Check the app from a browser:

```bash
http://<minipc-or-node-ip>:30180
```

## Updates

After code changes:

1. Rebuild the images.
2. Re-import or re-push them.
3. Restart the deployments:

```bash
kubectl -n learning-engine rollout restart deploy/learning-engine-backend
kubectl -n learning-engine rollout restart deploy/learning-engine-frontend
kubectl -n learning-engine rollout status deploy/learning-engine-backend
kubectl -n learning-engine rollout status deploy/learning-engine-frontend
```

## Storage note

The backend uses a single `ReadWriteOnce` PVC with the `local-path` storage class and is pinned to `kubernetes.io/hostname=minipc`. That keeps SQLite and admin-written YAML/config files on the same node. If you move the backend pod to another node later, plan to migrate the PVC data first.
