const { spawn } = require('child_process');
const http = require('http');

const port = 3004;
http.createServer((req, res) => {
    const decodedUrl = "http://gold.api-cdn.cloud/live/62727a62ac/8c3b66fdad/414213.m3u8";

    res.writeHead(200, {
        'Content-Type': 'video/MP2T',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
    });

    const ffmpegParams = [
        '-i', decodedUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-f', 'mpegts',
        'pipe:1'
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegParams);

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (d) => console.error(d.toString()));

    req.on('close', () => {
        ffmpegProcess.kill('SIGKILL');
    });

}).listen(port, () => console.log('server on ' + port));
