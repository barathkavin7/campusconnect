module.exports = {
  apps: [{
    name: 'campusconnect',
    cwd: './backend',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    time: true
  }]
};
