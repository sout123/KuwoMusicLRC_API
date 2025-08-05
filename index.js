const needle = require('needle')
const process = require('process')
const deflateRaw = require('zlib')
const { inflate } = require('zlib')
const iconv = require('iconv-lite')

const bufkey = Buffer.from('yeelion')
const bufkeylen = bufkey.length

// 音乐 rid
let musicId = 65633689

const buildParams = (id, isGetLyricx) => {
  console.log('\n--- Step 1: 构建请求参数 ---');
  let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`
  if (isGetLyricx) params += '&lrcx=1'
  console.log('1.1 - 原始参数字符串:', params);
  const bufstr = Buffer.from(params)
  const bufstrlen = bufstr.length
  const output = new Uint16Array(bufstrlen)
  let i = 0
  console.log('1.2 - 加密方法: 逐字节异或(XOR)');
  console.log('1.3 - 加密密钥:', bufkey.toString());
  while (i < bufstrlen) {
    let j = 0
    while (j < bufkeylen && i < bufstrlen) {
      output[i] = bufkey[j] ^ bufstr[i]
      i++
      j++
    }
  }
  const encryptedBuffer = Buffer.from(output);
  console.log('1.4 - 异或加密后的Buffer大小:', encryptedBuffer.length, 'bytes');
  const finalParams = Buffer.from(output).toString('base64');
  console.log('1.5 - Base64编码后的最终参数:', finalParams);
  console.log('--- Step 1: 完成 ---');
  return finalParams;
}

const cancelHttp = requestObj => {
  // console.log(requestObj)
  if (!requestObj) return
  // console.log('cancel:', requestObj)
  if (!requestObj.abort) return
  requestObj.abort()
}

const requestMsg = {
  fail: '请求异常，若还是不行就换一首吧。。。',
  unachievable: '接口无法访问了！',
  timeout: '请求超时',
  // unachievable: '重试下看能不能播放吧~',
  notConnectNetwork: '无法连接到服务器',
  cancelRequest: '取消http请求',
}

const request = (url, options, callback) => {
  let data
  if (options.body) {
    data = options.body
  } else if (options.form) {
    data = options.form
    // data.content_type = 'application/x-www-form-urlencoded'
    options.json = false
  } else if (options.formData) {
    data = options.formData
    // data.content_type = 'multipart/form-data'
    options.json = false
  }
  options.response_timeout = options.timeout

  return needle.request(options.method || 'get', url, data, options, (err, resp, body) => {
    if (!err) {
      body = resp.body = resp.raw.toString()
      try {
        resp.body = JSON.parse(resp.body)
      } catch (_) {}
      body = resp.body
    }
    callback(err, resp, body)
  }).request
}


const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
}

const handleDeflateRaw = data => new Promise((resolve, reject) => {
  deflateRaw(data, (err, buf) => {
    if (err) return reject(err)
    resolve(buf)
  })
})

const regx = /(?:\d\w)+/g

const fetchData = async(url, method, {
  headers = {},
  format = 'json',
  timeout = 15000,
  ...options
}, callback) => {
  headers = Object.assign({}, headers)
  const bHh = '624868746c'
  if (headers[bHh]) {
    const path = url.replace(/^https?:\/\/[\w.:]+\//, '/')
    let s = Buffer.from(bHh, 'hex').toString()
    s = s.replace(s.substr(-1), '')
    s = Buffer.from(s, 'base64').toString()
    let v = process.versions.app.split('-')[0].split('.').map(n => n.length < 3 ? n.padStart(3, '0') : n).join('')
    let v2 = process.versions.app.split('-')[1] || ''
    headers[s] = !s || `${(await handleDeflateRaw(Buffer.from(JSON.stringify(`${path}${v}`.match(regx), null, 1).concat(v)).toString('base64'))).toString('hex')}&${parseInt(v)}${v2}`
    delete headers[bHh]
  }
  return request(url, {
    ...options,
    method,
    headers: Object.assign({}, defaultHeaders, headers),
    timeout,
    json: format === 'json',
  }, (err, resp, body) => {
    if (err) return callback(err, null)
    callback(null, resp, body)
  })
}
const buildHttpPromose = (url, options) => {
  let obj = {
    isCancelled: false,
  }
  obj.promise = new Promise((resolve, reject) => {
    obj.cancelFn = reject
    // console.log(`\nsend request---${url}`)
    fetchData(url, options.method, options, (err, resp, body) => {
    // options.isShowProgress && window.api.hideProgress()
    //   console.log(`\nresponse---${url}`)
    //   console.log(body)
      obj.requestObj = null
      obj.cancelFn = null
      if (err) return reject(err)
      resolve(resp)
    }).then(ro => {
      obj.requestObj = ro
      if (obj.isCancelled) obj.cancelHttp()
    })
  })
  obj.cancelHttp = () => {
    if (!obj.requestObj) return obj.isCancelled = true
    cancelHttp(obj.requestObj)
    obj.requestObj = null
    obj.promise = obj.cancelHttp = null
    obj.cancelFn(new Error(requestMsg.cancelRequest))
    obj.cancelFn = null
  }
  return obj
}
const httpFetch = (url, options = { method: 'get' }) => {
  const requestObj = buildHttpPromose(url, options)
  requestObj.promise = requestObj.promise.catch(err => {
    if (err.message === 'socket hang up') {
      return Promise.reject(new Error(requestMsg.unachievable))
    }
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
        return Promise.reject(new Error(requestMsg.timeout))
      case 'ENOTFOUND':
        return Promise.reject(new Error(requestMsg.notConnectNetwork))
      default:
        return Promise.reject(err)
    }
  })
  return requestObj
}

const isGetLyricx = true
const handleInflate = data => new Promise((resolve, reject) => {
    inflate(data, (err, result) => {
        if (err) return reject(err)
        resolve(result)
    })
})
const bufKey = Buffer.from('yeelion')
const bufKeyLen = bufKey.length
const decodeLyrics = async(buf, isGetLyricx) => {
    console.log('\n--- Step 3: 解密歌词数据 ---');
    console.log('3.1 - 接收到的原始Buffer大小:', buf.length, 'bytes');
    if (buf.toString('utf8', 0, 10) != 'tp=content') {
        console.log('-> 内容格式不匹配 "tp=content"，解密终止');
        return ''
    }
    console.log('3.2 - 内容格式检查通过 ("tp=content")');
    const compressedData = buf.slice(buf.indexOf('\r\n\r\n') + 4);
    console.log('3.3 - 提取到zlib压缩的数据大小:', compressedData.length, 'bytes');
    console.log('3.4 - 解压方法: zlib.inflate');
    const lrcData = await handleInflate(compressedData)
    console.log('3.5 - zlib解压后的数据大小:', lrcData.length, 'bytes');
    if (!isGetLyricx) {
      console.log('3.6 - 解码方法: gb18030');
      const decodedLrc = iconv.decode(lrcData, 'gb18030');
      console.log('3.7 - gb18030解码后的歌词:', decodedLrc);
      console.log('--- Step 3: 完成 ---\n');
      return decodedLrc
    }
    const base64Str = lrcData.toString();
    console.log('3.6 - (lrcx格式) 解压后为Base64字符串, 大小:', base64Str.length, 'bytes');
    const bufStr = Buffer.from(base64Str, 'base64')
    console.log('3.7 - (lrcx格式) Base64解码后的Buffer大小:', bufStr.length, 'bytes');
    const bufStrLen = bufStr.length
    const output = new Uint16Array(bufStrLen)
    let i = 0
    console.log('3.8 - (lrcx格式) 解密方法: 逐字节异或(XOR)');
    console.log('3.9 - (lrcx格式) 解密密钥:', bufKey.toString());
    while (i < bufStrLen) {
        let j = 0
        while (j < bufKeyLen && i < bufStrLen) {
            output[i] = bufStr[i] ^ bufKey[j]
            i++
            j++
        }
    }
    const decryptedBuffer = Buffer.from(output);
    console.log('3.10 - (lrcx格式) 异或解密后的Buffer大小:', decryptedBuffer.length, 'bytes');
    console.log('3.11 - (lrcx格式) 最终解码方法: gb18030');
    const finalLrc = iconv.decode(decryptedBuffer, 'gb18030');
    console.log('3.12 - (lrcx格式) gb18030解码后的最终歌词:', finalLrc);
    console.log('--- Step 3: 完成 ---\n');
    return finalLrc;
}

const convertKuwoLrc = (rawLrc) => {
  console.log('\n--- Step 4: 开始转换歌词格式 ---');
  let lines = rawLrc.split(/\r\n|\r|\n/);
  let kuwoOffset = 1;
  let kuwoOffset2 = 1;

  const kuwoTagMatch = rawLrc.match(/\[kuwo:(\d+)\]/);
  if (kuwoTagMatch) {
    const kuwoValue = parseInt(kuwoTagMatch[1], 8);
    kuwoOffset = Math.trunc(kuwoValue / 10);
    kuwoOffset2 = kuwoValue % 10;
    if (kuwoOffset === 0 || kuwoOffset2 === 0) {
      console.log('警告: kuwo标签解析出无效的offset，将使用默认值');
      kuwoOffset = 1;
      kuwoOffset2 = 1;
    }
  }
  console.log(`4.1 - 解析到kuwo参数: offset=${kuwoOffset}, offset2=${kuwoOffset2}`);

  const formatTime = (ms) => {
    if (isNaN(ms) || ms < 0) ms = 0;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.round(ms % 1000);
    return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}]`;
  };

  const lineTimeRegex = /^\[(\d{2}:\d{2}\.\d{3})\](.*)$/;
  const wordRegex = /<(-?\d+),(-?\d+)>([^<]*)/g;
  const translationRegex = /[\u4e00-\u9fa5]/;

  let processedLrc = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTimeMatch = line.match(lineTimeRegex);

    if (!lineTimeMatch) {
      processedLrc.push(line);
      continue;
    }
    
    const content = lineTimeMatch[2];
    if (content.replace(/<0,0>/g, '').trim() === '') {
        continue;
    }

    const lineTimeStr = lineTimeMatch[1];
    const timeParts = lineTimeStr.split(/[:.]/);
    const lineStartTimeMs = parseInt(timeParts[0]) * 60000 + parseInt(timeParts[1]) * 1000 + parseInt(timeParts[2]);

    let isTranslationLine = /^<0,0>/.test(content) && translationRegex.test(content);
    
    // This logic handles original lines and their potential paired translation
    if (!isTranslationLine) {
        let newContent = '';
        let match;
        let firstWord = true;
        const lineWordRegex = new RegExp(wordRegex);

        while ((match = lineWordRegex.exec(content)) !== null) {
            const offset = parseInt(match[1], 10);
            const offset2 = parseInt(match[2], 10);
            const text = match[3];

            const wordStartTimeMs = Math.abs((offset + offset2) / (kuwoOffset * 2));
            const absoluteTimeMs = lineStartTimeMs + wordStartTimeMs;

            if (firstWord) {
                newContent += text;
                firstWord = false;
            } else {
                newContent += `${formatTime(absoluteTimeMs)}${text}`;
            }
        }

        // Calculate end time based on the last word
        let calculatedEndTimestamp = '';
        const wordMatches = Array.from(content.matchAll(wordRegex));
        if (wordMatches.length > 0) {
            const lastMatch = wordMatches[wordMatches.length - 1];
            const offset = parseInt(lastMatch[1], 10);
            const offset2 = parseInt(lastMatch[2], 10);
            const wordStartTimeMs = Math.abs((offset + offset2) / (kuwoOffset * 2));
            const wordDurationMs = Math.abs((offset - offset2) / (kuwoOffset2 * 2));
            const wordEndTimeMs = wordStartTimeMs + wordDurationMs;
            const absoluteEndTimeMs = lineStartTimeMs + wordEndTimeMs;
            calculatedEndTimestamp = formatTime(absoluteEndTimeMs);
        }

        // Check for an immediately following translation line
        let translationText = '';
        let translationEndTimestamp = '';
        if (i + 1 < lines.length) {
            const nextLine = lines[i+1];
            const nextLineTimeMatch = nextLine.match(lineTimeRegex);
            if (nextLineTimeMatch && /^<0,0>/.test(nextLineTimeMatch[2]) && translationRegex.test(nextLineTimeMatch[2])) {
                translationText = nextLineTimeMatch[2].replace(/<0,0>/g, '').trim();
                
                // Translation's end time is the start of the next actual lyric line
                 for (let j = i + 2; j < lines.length; j++) {
                    const futureLineMatch = lines[j].match(lineTimeRegex);
                    if (futureLineMatch) {
                        translationEndTimestamp = `[${futureLineMatch[1]}]`;
                        break;
                    }
                }
                // If it's the last one, use the original's calculated end time.
                if (!translationEndTimestamp) {
                    translationEndTimestamp = calculatedEndTimestamp;
                }
                i++; // Skip the translation line in the next iteration
            }
        }
        
        processedLrc.push(`[${lineTimeStr}]${newContent}${calculatedEndTimestamp || ''}`);
        if (translationText) {
            processedLrc.push(`[${lineTimeStr}]${translationText}${translationEndTimestamp || calculatedEndTimestamp}`);
        }
    }
  }

  console.log('4.2 - 歌词格式转换完成');
  console.log('--- Step 4: 完成 ---\n');
  return processedLrc.join('\n');
};

const rendererInvoke = async(name, params) => {
    const lrc = await decodeLyrics(Buffer.from(params.lrcBase64, 'base64'), isGetLyricx)
    return Buffer.from(lrc).toString('base64')
}
const decodeLyric = base64Data => rendererInvoke('handle_kw_decode_lyric', base64Data)

console.log('--- API调用信息 ---');
console.log('请求的音乐 (musicId):', musicId);
const finalRequestUrl = `http://newlyric.kuwo.cn/newlyric.lrc?${buildParams(musicId, isGetLyricx)}`;

console.log('\n--- Step 2: 发起HTTP请求 ---');
console.log('2.1 - 请求API: http://newlyric.kuwo.cn/newlyric.lrc');
console.log('2.2 - 请求方法: GET');
console.log('2.3 - 完整请求URL:', finalRequestUrl);
console.log('--- Step 2: 完成 ---\n');

const requestObj = httpFetch(finalRequestUrl)
requestObj.promise.then(({ statusCode, body, raw }) => {
    if (statusCode !== 200) return Promise.reject(new Error(JSON.stringify(body)))
    return decodeLyric({ lrcBase64: raw.toString('base64'), isGetLyricx })
}).then(base64Data => {
    const finalLrc = Buffer.from(base64Data, 'base64').toString()
    console.log('\n--- 解密后的歌词 (原始格式) ---')
    console.log(finalLrc)

    const convertedLrc = convertKuwoLrc(finalLrc);
    console.log('\n--- 转换后的LRC歌词 ---');
    console.log(convertedLrc);
}).catch(err => {
    console.error('请求或解密过程中发生错误:', err)
})

