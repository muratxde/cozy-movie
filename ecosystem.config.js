module.exports = {
  apps: [
    {
      name: "cozy-movie",
      script: "./server.js",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
