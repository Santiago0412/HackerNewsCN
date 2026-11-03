import { handleRequest } from "./gateway.js";

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
