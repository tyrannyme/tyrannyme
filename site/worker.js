export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.tyranny.me") {
      url.hostname = "tyranny.me";
      return Response.redirect(url, 301);
    }
    return env.ASSETS.fetch(request);
  },
};
