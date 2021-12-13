  import React, { useState } from 'react';
  import "@google/model-viewer";
  import axios from 'axios';
  import crypto from "crypto-js";

  const App = () => {

  const [video, setVideo] = useState("");

  const handleVideoUpload = async (e) => {
    const mediaFile = e.target.files[0];
    setVideo(URL.createObjectURL(mediaFile))
  }

  const convert = (from, to) => str => Buffer.from(str, from).toString(to)
  const hexToUtf8 = convert('hex', 'utf8')
  const str2ab = (str) => {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  const ab2str = (buf) => {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
  }

  const readTextFile = (input) => new Promise((resolve, reject) => {
    var reader = new FileReader();
    reader.readAsText(input);
    reader.onload = () => {
      const url = reader.result.split('\n').shift()
      resolve(url)
    };
    reader.onerror = error => reject(error);
  })

  const fileTypeOfUrl = (urlOfMedia) => {
    var mediaType = ";"
    switch (true) {
      case urlOfMedia.includes("jpg"):
        mediaType = "image/jpg";
        break;
      case urlOfMedia.includes("jpeg"):
        mediaType = "image/jpeg";
        break;
      case urlOfMedia.includes("png"):
        mediaType = "image/png";
        break;
      case urlOfMedia.includes("youtube"):
        mediaType = "video/mp4";
        break;
      case urlOfMedia.includes("mp4"):
        mediaType = "video/mp4";
        break;
      case urlOfMedia.includes("webm"):
        mediaType = "video/webm";
        break;
      case urlOfMedia.includes("glb"):
        mediaType = "3d/glb"
        break;
      case urlOfMedia.includes("glft"):
        mediaType = "3d/glft"
        break;
      case urlOfMedia.includes("usdz"):
        mediaType = "3d/usdz"
        break;
      default:
        break;
    }

    return mediaType;
  }

  const getKeysOfMedia = async (artworkMediaId, userUid) => {
    try {
      const result = await axios.get("https://v2.dev.api.danae.io/video-encryption/get-media-keys/172/EoOx1pG5o6URdGdaO0Nme")
      return result.data.results;
    }
    catch (err) {
      console.log("Error", err);
    }
  }

  const importRsaPrivKey = async (pem) => {
    const pemContents = hexToUtf8(pem);
    const binaryDerString = Buffer.from(pemContents, 'base64').toString();
    const binaryDer = str2ab(binaryDerString);

    return (
      await window.crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        {
          name: "RSA-OAEP",
          hash: "SHA-256",
        },
        true,
        ["decrypt"]
      ).then((privateKey) => {
        return privateKey;
      }).catch(err => {
        console.log("Error", err)
      })
    )
  }

  const decryptAesKey = async (mediaKeys) => {
    const decryptedRsaPrivKey = crypto.AES.decrypt(mediaKeys.encrypted_rsa_private_key, mediaKeys.hash_account).toString(crypto.enc.Utf8);
    const importedRsaPrivKey = await importRsaPrivKey(decryptedRsaPrivKey);

    const strAesKey = hexToUtf8(mediaKeys.encrypted_aes_key);
    const arrayBuffer = str2ab(strAesKey);
    const decryptedArrayBuff = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP"
      },
      importedRsaPrivKey,
      arrayBuffer
    );
    return ab2str(decryptedArrayBuff);
  }

  const getVideoSlicesFromId = async (artworkMediaId) => {
    try {
      const result = await axios.get("https://v2.dev.api.danae.io/video-encryption/get-artwork-media-slices/172")
      return result.data.results;
    } catch (err) {
      console.log("Error", err)
    }
  }

  const getEncryptedArtwork = async (videoUrlsFromDB) => {
    const getEncVideoChunks = [];

    for (var videoPart = 0; videoPart < videoUrlsFromDB.length; videoPart++) {
      try {
        const result = await fetch(videoUrlsFromDB[videoPart].url, {
          method: "GET"
        }).then(async (res) => {
          console.log(`Downloading media part: ${videoPart + 1}/${videoUrlsFromDB.length}`);
          return await res.blob();
        })
        getEncVideoChunks.push(result);
      } catch (err) {
        console.log(`Error to fetch on ${videoUrlsFromDB[videoPart].url}\n${err}`)
      }
    }

    return getEncVideoChunks;
  }

  const convertWordArrayToUint8Array = (wordArray) => {
    var arrayOfWords = wordArray.hasOwnProperty("words") ? wordArray.words : [];
    var length = wordArray.hasOwnProperty("sigBytes") ? wordArray.sigBytes : arrayOfWords.length * 4;
    var uInt8Array = new Uint8Array(length), index = 0, word, i;
    for (i = 0; i < length; i++) {
      word = arrayOfWords[i];
      uInt8Array[index++] = word >> 24;
      uInt8Array[index++] = (word >> 16) & 0xff;
      uInt8Array[index++] = (word >> 8) & 0xff;
      uInt8Array[index++] = word & 0xff;
    }
    return uInt8Array;
  }

  const decrypt = (input, aesKey) => new Promise((resolve, reject) => {
    var reader = new FileReader();
    reader.readAsText(input);
    reader.onload = () => {
      var decrypted = crypto.AES.decrypt(reader.result, aesKey);
      var typedArray = convertWordArrayToUint8Array(decrypted);
      var fileDec = new File([typedArray], "", { type: input.type });
      resolve(fileDec)
    };
    reader.onerror = error => reject(error);
  })

  const decryptChunk = async (chunksArray, aesKey) => {
    const encDataArray = [];
    for (let counter = 0; counter < chunksArray.length; counter++)
      await decrypt(chunksArray[counter], aesKey).then((res) => {
        console.log(`Decrypting video part ${counter + 1}/${chunksArray.length}`);
        encDataArray.push(res);
      })
    return encDataArray;
  }

  const getMediaFromDB = async (artworkVideoId, userUid) => {
    const mediaKeys = await getKeysOfMedia(artworkVideoId, userUid);
    console.log("Media keys ==>", mediaKeys)
    const decryptedAesKey = await decryptAesKey(mediaKeys);
    console.log("decryptedAesKey ==>", decryptedAesKey)
    const videoUrlsFromDB = await getVideoSlicesFromId(artworkVideoId);
    console.log("videoUrlsFromDB ==>", videoUrlsFromDB)
    const getEncVideoChunks = await getEncryptedArtwork(videoUrlsFromDB);
    console.log("getEncVideoChunks ==>", getEncVideoChunks)
    const decDataArray = await decryptChunk(getEncVideoChunks, decryptedAesKey);
    console.log("decDataArray ==>", decDataArray)
    const recomposedVideoFile = new File(decDataArray, "", { type: decDataArray[0].type });
    return { recomposedVideoFile: recomposedVideoFile, isUrl: videoUrlsFromDB[0].is_media_url, url: "" };
  }

  return (
    <div className="App">
    <div>UP</div>
    {/* <model-viewer src={video} camera-controls></model-viewer> */}
    <input type="file" onChange={handleVideoUpload} />
    <p>3D Oject = {video}</p>
    <div id="card">
      <model-viewer
        src="/Box.gltf"
        ios-src=""
        poster="https://cdn.glitch.com/36cb8393-65c6-408d-a538-055ada20431b%2Fposter-astronaut.png?v=1599079951717"
        alt="A 3D model of an astronaut"
        shadow-intensity="1"
        camera-controls
        auto-rotate
        ar
      ></model-viewer>
    </div>
    <button title="Press to download" type="button" onClick={async () => {
      const artworkMediaFile = await getMediaFromDB(172, "EoOx1pG5o6URdGdaO0Nme");
      console.log("Artwork from Danae db", artworkMediaFile)
      if (artworkMediaFile.isUrl) {
        artworkMediaFile.url = await readTextFile(artworkMediaFile.recomposedVideoFile)
        if (artworkMediaFile.recomposedVideoFile.type === "text/plain") {
          artworkMediaFile.recomposedVideoFile = new File([artworkMediaFile.recomposedVideoFile], artworkMediaFile.recomposedVideoFile.name, { type: fileTypeOfUrl(artworkMediaFile.url) });
        }
      } else {
        artworkMediaFile.url = URL.createObjectURL(artworkMediaFile.recomposedVideoFile)
      }
      setVideo(artworkMediaFile.url)
      console.log("Url of decrypted artwork ==>", artworkMediaFile.url)
    }}>
      Press to download
    </button>
    {video !== "" ? 
      <div>
        <model-viewer src={video} height="100%" width="100%" camera-controls></model-viewer>
      </div>
    :
      null
    }
    </div>
  )
}

export default App;
