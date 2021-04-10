apt-get -y --force-yes install wget
# wget "https://www.apache.org/dyn/mirrors/mirrors.cgi?action=download&filename=pulsar/pulsar-2.6.1/DEB/apache-pulsar-client.deb" -O apache-pulsar-client.deb
# wget "https://www.apache.org/dyn/mirrors/mirrors.cgi?action=download&filename=pulsar/pulsar-2.6.1/DEB/apache-pulsar-client-dev.deb" -O apache-pulsar-client-dev.deb
dpkg -i apache-pulsar-client.deb
dpkg -i apache-pulsar-client-dev.deb
npm config set registry https://registry.npm.taobao.org

npm install
npm audit fix
npm rebuild
DEBUG="app:*" node sdist
