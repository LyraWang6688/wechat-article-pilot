module.exports = {
  apps: [
    {
      name: "wechat-article-pilot-dev",
      script: "npm",
      args: "run dev",
      cwd: "/opt/wechat-article-pilot-dev",
      env: {
        NODE_ENV: "development",
        PORT: "3010"
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
};
