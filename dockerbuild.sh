# bash
set -e

# 参数设置
VERSION=`awk -F"\"" '/version/{print $4}' package.json`
NAME=`awk -F"\"" '/\"name\"/{print $4}' package.json`
BRANCH=`awk -F"\"" '/branch/{print $4}' package.json`
if [ -n "$BRANCH" ]; then
  VERSION=${VERSION}-${BRANCH}
fi
URL=registry.cn-shanghai.aliyuncs.com/windsome/$NAME

# 编译
yarn run build
docker login --username=86643838@163.com --password=a12345678 registry.cn-shanghai.aliyuncs.com

# 打包相应版本
TAGVERSION=$URL:$VERSION
echo '开始打包:'$TAGVERSION
docker build . -t $TAGVERSION

echo '开始推送:'$TAGVERSION
docker push $TAGVERSION
echo '完成推送:'$TAGVERSION

# # 打最新版本标签并推送
# TAGLATEST=$URL:latest
# echo '开始推送:'$TAGLATEST
# docker tag $TAGVERSION $TAGLATEST
# docker push $TAGLATEST
# echo '完成推送:'$TAGLATEST

