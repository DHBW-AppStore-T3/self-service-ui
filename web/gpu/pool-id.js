// Same rule as the API (pool ids end up in Kubernetes names): lowercase letters, digits and single hyphens inside, starting with a letter, 2–20 characters.
const POOL_ID = /^[a-z](-?[a-z0-9])+$/;

export const validPoolId = (id) => POOL_ID.test(id) && id.length <= 20;
