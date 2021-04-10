FROM windsome/node-pulsar:2.6.1
RUN echo "Asia/Shanghai" > /etc/timezone
RUN dpkg-reconfigure -f noninteractive tzdata
COPY sdist /var/www/sdist
COPY package.json /var/www/
COPY .babelrc /var/www/
RUN ls -R /var/www
#RUN cd /var/www && npm install
ADD node_modules /var/www/node_modules
#COPY node_modules /var/www/node_modules
EXPOSE 3107
WORKDIR /var/www/
# CMD DEBUG="app:*" node sdist
