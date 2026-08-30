const http = require('http');
const net = require('net');

const GITHUB_IP = '4.228.31.150'; // IP verificado da AWS/Azure para github.com

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Eco-Mitang Git DNS Bypass Tunnel');
});

server.on('connect', (req, clientSocket, head) => {
  const [host, port] = req.url.split(':');
  const targetIp = (host === 'github.com') ? GITHUB_IP : host;
  const targetPort = parseInt(port || '443', 10);

  const serverSocket = net.connect(targetPort, targetIp, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    clientSocket.destroy();
  });

  clientSocket.on('error', (err) => {
    serverSocket.destroy();
  });
});

server.listen(8089, '127.0.0.1', () => {
  console.log('Tunnel listening on 127.0.0.1:8089');
});
