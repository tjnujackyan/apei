# 使用较新的 Alpine 版本以获取支持 NestJS 的 Node.js 版本 (Alpine 3.13 的 Node 版本太旧)
FROM alpine:3.19

# 安装依赖包
RUN apk add --update --no-cache nodejs npm

# 指定工作目录
WORKDIR /app

# 拷贝包管理文件
COPY package*.json /app

# npm 源，选用国内镜像源以提高下载速度
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# npm 安装依赖 (包括 devDependencies 以支持 build)
RUN npm install

# 将当前目录所有文件拷贝到工作目录下
COPY . /app

# 执行 NestJS 构建 (使用本地 bin 路径，规避权限问题)
RUN ./node_modules/.bin/nest build

# 暴露端口 80
EXPOSE 80

# 执行启动命令 (生产模式)
CMD ["node", "dist/main"]
