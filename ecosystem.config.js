// PM2 进程管理配置
module.exports = {
  apps: [{
    name: 'guandan-game',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      PORT: 3000,
      HOST: '0.0.0.0',
    },
    max_memory_restart: '300M',
  }],
};
