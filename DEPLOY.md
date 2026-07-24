# 🃏 掼蛋游戏 - 部署指南

## 方式一：云服务器部署（推荐，国内可用）

### 1. 准备服务器
购买一台云服务器（阿里云ECS / 腾讯云轻量应用服务器），最低配置即可：
- 系统：Ubuntu 22.04 或 CentOS 7+
- 内存：1GB+
- 带宽：1Mbps+

### 2. 安装环境

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y nodejs npm nginx

# 或 CentOS
sudo yum install -y nodejs npm nginx

# 全局安装 PM2（进程守护）
sudo npm install -g pm2
```

### 3. 上传代码

```bash
# 在服务器上创建目录
mkdir -p /opt/guandan && cd /opt/guandan

# 方式A：从本地上传（在本地电脑执行）
scp -r public/ server.js package.json root@你的服务器IP:/opt/guandan/

# 方式B：用 Git
git clone <你的仓库地址> /opt/guandan

# 安装依赖
cd /opt/guandan && npm install
```

### 4. 启动服务

```bash
# PM2 守护进程
pm2 start server.js --name guandan-game
pm2 save
pm2 startup  # 设置开机自启
```

### 5. 配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-enabled/guandan
```

粘贴 `nginx.conf.example` 的内容，把 `your-domain.com` 改成你的域名或 IP。

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 6. 访问
浏览器打开 `http://你的服务器IP` 或 `http://你的域名`

---

## 方式二：Docker 部署

```bash
# 在服务器上
docker compose up -d

# 或单独用 Docker
docker build -t guandan .
docker run -d -p 3000:3000 --restart unless-stopped guandan
```

---

## 方式三：Zeabur 一键部署（支持国内）

1. 把代码推送到 GitHub
2. 登录 [Zeabur](https://zeabur.com)
3. 导入 GitHub 项目
4. 自动检测为 Node.js 项目并部署
5. 获得公网域名

---

## 方式四：Railway 部署

1. 把代码推送到 GitHub
2. 登录 [Railway.app](https://railway.app)
3. New Project → Deploy from GitHub
4. 选择此项目，自动部署

---

## 本地开发

```bash
npm install
node server.js
# 打开 http://localhost:3000
```

## 移动端/微信访问注意事项

1. **必须 HTTPS**：微信浏览器要求 HTTPS。配置 SSL 证书（可用 Let's Encrypt 免费证书）
2. **域名**：微信需要已备案域名
3. **端口**：使用 443（HTTPS），Nginx 反代到 3000
