'use strict';var _0x4d6001=_0x1514;(function(_0x135640,_0x1ec0c1){var _0x20a565={_0x352695:0x20a,_0x47cebb:0x1d7,_0x27bce2:0x1cb,_0x383942:0x1cf,_0x1f8e0c:0x1e5,_0x452368:0x1e2,_0x424f36:0x1f1},_0x2d3ba3=_0x1514,_0x1d9baf=_0x135640();while(!![]){try{var _0x5a5e83=-parseInt(_0x2d3ba3(_0x20a565._0x352695))/0x1*(parseInt(_0x2d3ba3(_0x20a565._0x47cebb))/0x2)+parseInt(_0x2d3ba3(0x1bb))/0x3*(parseInt(_0x2d3ba3(_0x20a565._0x27bce2))/0x4)+parseInt(_0x2d3ba3(0x1c0))/0x5*(-parseInt(_0x2d3ba3(_0x20a565._0x383942))/0x6)+-parseInt(_0x2d3ba3(_0x20a565._0x1f8e0c))/0x7*(parseInt(_0x2d3ba3(_0x20a565._0x452368))/0x8)+parseInt(_0x2d3ba3(0x200))/0x9+parseInt(_0x2d3ba3(0x1ed))/0xa*(-parseInt(_0x2d3ba3(0x1ee))/0xb)+parseInt(_0x2d3ba3(_0x20a565._0x424f36))/0xc;if(_0x5a5e83===_0x1ec0c1)break;else _0x1d9baf['push'](_0x1d9baf['shift']());}catch(_0x52a8aa){_0x1d9baf['push'](_0x1d9baf['shift']());}}}(_0x429f,0xefae6));function _0x1514(_0x5c2593,_0x9b67d3){_0x5c2593=_0x5c2593-0x1a5;var _0x429fdb=_0x429f();var _0x151490=_0x429fdb[_0x5c2593];if(_0x1514['YrGFWd']===undefined){var _0x324091=function(_0x4e5567){var _0x10b7e8='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x356cb3='',_0x556c90='';for(var _0x4d33de=0x0,_0x44c95a,_0x13650b,_0x1d0a0c=0x0;_0x13650b=_0x4e5567['charAt'](_0x1d0a0c++);~_0x13650b&&(_0x44c95a=_0x4d33de%0x4?_0x44c95a*0x40+_0x13650b:_0x13650b,_0x4d33de++%0x4)?_0x356cb3+=String['fromCharCode'](0xff&_0x44c95a>>(-0x2*_0x4d33de&0x6)):0x0){_0x13650b=_0x10b7e8['indexOf'](_0x13650b);}for(var _0x5c416e=0x0,_0x129fe8=_0x356cb3['length'];_0x5c416e<_0x129fe8;_0x5c416e++){_0x556c90+='%'+('00'+_0x356cb3['charCodeAt'](_0x5c416e)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x556c90);};_0x1514['OaRIgp']=_0x324091,_0x1514['QYZZWC']={},_0x1514['YrGFWd']=!![];}var _0x3d209e=_0x429fdb[0x0],_0x37580b=_0x5c2593+_0x3d209e,_0x2cbdf5=_0x1514['QYZZWC'][_0x37580b];return!_0x2cbdf5?(_0x151490=_0x1514['OaRIgp'](_0x151490),_0x1514['QYZZWC'][_0x37580b]=_0x151490):_0x151490=_0x2cbdf5,_0x151490;}var DOMAIN=_0x4d6001(0x1f5),TMDB_API=_0x4d6001(0x1f4),TMDB_API_KEY='1865f43a0549ca50d341dd9ab8b29f49',USER_AGENT='Mozilla/5.0\x20(Windows\x20NT\x2010.0;\x20Win64;\x20x64)\x20AppleWebKit/537.36\x20(KHTML,\x20like\x20Gecko)\x20Chrome/120.0.0.0\x20Safari/537.36';function getBaseUrl(_0x356cb3){if(!_0x356cb3)return DOMAIN;var _0x556c90=_0x356cb3['match'](/^(https?:\/\/[^\/]+)/);return _0x556c90?_0x556c90[0x1]:DOMAIN;}function fixUrl(_0x4d33de,_0x44c95a){var _0x89207e={_0x35a6a7:0x1ba,_0x167805:0x1b1,_0xaff78a:0x1ba},_0x244495=_0x4d6001;if(!_0x4d33de)return'';if(_0x4d33de[_0x244495(_0x89207e._0x35a6a7)](_0x244495(_0x89207e._0x167805))===0x0)return _0x4d33de;if(_0x4d33de[_0x244495(0x1ba)]('//')===0x0)return'https:'+_0x4d33de;if(_0x4d33de[_0x244495(_0x89207e._0xaff78a)]('/')===0x0)return _0x44c95a+_0x4d33de;return _0x44c95a+'/'+_0x4d33de;}function toFormEncoded(_0x13650b){var _0x4ff132={_0x33ef25:0x1de},_0x556ecc=_0x4d6001;return Object[_0x556ecc(0x1b9)](_0x13650b)['map'](function(_0x1d0a0c){return encodeURIComponent(_0x1d0a0c)+'='+encodeURIComponent(_0x13650b[_0x1d0a0c]||'');})[_0x556ecc(_0x4ff132._0x33ef25)]('&');}function stripTags(_0x5c416e){var _0x12cce0={_0x5b6e20:0x1c7,_0x507f88:0x1c7,_0x415062:0x1c7,_0x536cff:0x1da},_0x295289=_0x4d6001;return(_0x5c416e||'')[_0x295289(_0x12cce0._0x5b6e20)](/<[^>]+>/g,'')['replace'](/&amp;/g,'&')[_0x295289(_0x12cce0._0x507f88)](/&lt;/g,'<')[_0x295289(_0x12cce0._0x507f88)](/&gt;/g,'>')[_0x295289(_0x12cce0._0x5b6e20)](/&quot;/g,'\x22')[_0x295289(_0x12cce0._0x415062)](/&#39;/g,'\x27')[_0x295289(_0x12cce0._0x507f88)](/&nbsp;/g,'\x20')[_0x295289(_0x12cce0._0x536cff)]();}function extractFormAction(_0x129fe8){var _0x5de8f4=_0x129fe8['match'](/<form[^>]*id="landing"[^>]*action="([^"]+)"/i)||_0x129fe8['match'](/<form[^>]*action="([^"]+)"[^>]*id="landing"/i);return _0x5de8f4?_0x5de8f4[0x1]:null;}function extractFormInputs(_0x30a4c0){var _0x20c675={_0x1d0aae:0x204},_0x4daf41=_0x4d6001,_0x208fce={},_0x21f4ca=_0x30a4c0[_0x4daf41(0x204)](/<form[^>]*id="landing"[^>]*>([\s\S]*?)<\/form>/i)||_0x30a4c0['match'](/<form[^>]*>([\s\S]*?)<\/form>/i),_0x521c64=_0x21f4ca?_0x21f4ca[0x1]:_0x30a4c0,_0x26e2fa=/<input[^>]+>/gi,_0x2a5eca;while((_0x2a5eca=_0x26e2fa['exec'](_0x521c64))!==null){var _0x2db8ed=_0x2a5eca[0x0][_0x4daf41(0x204)](/name="([^"]+)"/i),_0x319f5b=_0x2a5eca[0x0][_0x4daf41(_0x20c675._0x1d0aae)](/value="([^"]*)"/i);if(_0x2db8ed)_0x208fce[_0x2db8ed[0x1]]=_0x319f5b?_0x319f5b[0x1]:'';}return _0x208fce;}function extractScriptContaining(_0x17fbb2,_0x3a0a66){var _0x2fe4f4={_0x2fb4a0:0x1b5},_0x3882a0=_0x4d6001,_0x45a24a=/<script[^>]*>([\s\S]*?)<\/script>/gi,_0x306176;while((_0x306176=_0x45a24a[_0x3882a0(_0x2fe4f4._0x2fb4a0)](_0x17fbb2))!==null){if(_0x306176[0x1][_0x3882a0(0x1ba)](_0x3a0a66)!==-0x1)return _0x306176[0x1];}return'';}function extractMetaRefresh(_0x50bfce){var _0x40e44d=_0x4d6001,_0x4ab494=_0x50bfce[_0x40e44d(0x204)](/<meta[^>]*http-equiv="refresh"[^>]*content="([^"]+)"/i)||_0x50bfce['match'](/<meta[^>]*content="([^"]+)"[^>]*http-equiv="refresh"/i);if(!_0x4ab494)return null;var _0x2a7f04=_0x4ab494[0x1][_0x40e44d(0x204)](/url=(.+)/i);return _0x2a7f04?_0x2a7f04[0x1]['trim']():null;}function extractBtnSuccessLinks(_0x206d23){var _0x210555={_0x4665c5:0x1b5,_0x4cd745:0x1ba,_0x182bb8:0x1b1},_0x53f6f6=_0x4d6001,_0x43264f=[],_0x58ae0d={},_0xdf6a23=[/<a[^>]*class="[^"]*btn-success[^"]*"[^>]*href="([^"]+)"/gi,/<a[^>]*href="([^"]+)"[^>]*class="[^"]*btn-success[^"]*"/gi];for(var _0x482491=0x0;_0x482491<_0xdf6a23['length'];_0x482491++){var _0x348477=_0xdf6a23[_0x482491],_0x4244b8;while((_0x4244b8=_0x348477[_0x53f6f6(_0x210555._0x4665c5)](_0x206d23))!==null){_0x4244b8[0x1][_0x53f6f6(_0x210555._0x4cd745)](_0x53f6f6(_0x210555._0x182bb8))===0x0&&!_0x58ae0d[_0x4244b8[0x1]]&&(_0x58ae0d[_0x4244b8[0x1]]=!![],_0x43264f['push'](_0x4244b8[0x1]));}}return _0x43264f;}function extractTextCenterLinks(_0x499135){var _0x5e8a03={_0xfa9046:0x1b5,_0x5bca3a:0x1c8},_0x318533=_0x4d6001,_0x409d59=[],_0x194ecd=/<div[^>]*class="[^"]*text-center[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,_0x7c0d67;while((_0x7c0d67=_0x194ecd[_0x318533(_0x5e8a03._0xfa9046)](_0x499135))!==null){var _0x6fe059=_0x7c0d67[0x1],_0x2c75b9=/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,_0x5369d6;while((_0x5369d6=_0x2c75b9[_0x318533(0x1b5)](_0x6fe059))!==null){_0x409d59[_0x318533(_0x5e8a03._0x5bca3a)]({'href':_0x5369d6[0x1],'text':stripTags(_0x5369d6[0x2])});}}return _0x409d59;}function extractFirstListGroupItem(_0x3c636a){var _0x4bdb65=_0x3c636a['match'](/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>([\s\S]*?)<\/li>/i);return _0x4bdb65?stripTags(_0x4bdb65[0x1]):'';}function extractSizeFromHtml(_0x512577){var _0x169293={_0x14fcc6:0x1ba},_0x52ac72=_0x4d6001,_0x23fd92=/<li[^>]*>([\s\S]*?)<\/li>/gi,_0x44d013;while((_0x44d013=_0x23fd92['exec'](_0x512577))!==null){var _0x34ee85=stripTags(_0x44d013[0x1]);if(_0x34ee85[_0x52ac72(0x1ba)]('Size\x20:')!==-0x1||_0x34ee85[_0x52ac72(_0x169293._0x14fcc6)]('Size:')!==-0x1)return _0x34ee85[_0x52ac72(0x1c7)](/Size\s*:\s*/i,'')[_0x52ac72(0x1da)]();}return'';}function getIndexQuality(_0x1634e2){var _0x4f3293={_0x3141a8:0x204,_0x486f0a:0x207,_0x4f61df:0x1b7},_0xf6e1bf=_0x4d6001;if(!_0x1634e2)return'Unknown';var _0xd6930f=_0x1634e2[_0xf6e1bf(_0x4f3293._0x3141a8)](/(\d{3,4})[pP]/);if(_0xd6930f)return _0xd6930f[0x1]+'p';if(/\b4[kK]\b/[_0xf6e1bf(_0x4f3293._0x486f0a)](_0x1634e2)||/\bUHD\b(?!movies)/i[_0xf6e1bf(0x207)](_0x1634e2))return _0xf6e1bf(_0x4f3293._0x4f61df);return'Unknown';}function _0x429f(){var _0x24e802=['CMvZDw1LignSB3vK','CMvWBgfJzq','ChvZAa','qMX1uMf5ifjftvvy','sersAxa','otj0qw1TqK8','vuHetw92AwvZ','CMvZB2X2zq','CMvSzwfZzv9KyxrL','mJCYntj6BuDTAuK','yxbWBgLJyxrPB24VEc13D3CTzM9YBs11CMXLBMnVzgvK','Ahr0Chm6lY8','zhjPDMvZzwvK','y29Uy2f0','C3bSAxq','p3vYBd0','w1vire1VDMLLC10GyNLWyxnZshjLzMXPoIa','ngrLqMjswG','AhrTBa','z2v0','DhjPBq','Dw5KzwzPBMvK','z2v0u3rYzwfTCW','CxvHBgL0Eq','AM9PBG','C29YDa','p2fWAv9RzxK9','w1vire1VDMLLC10Gve1eqIbLCNjVCJOG','og5xAMrRzq','l2rVD25SB2fK','CgfYC2u','mZi5odiXmuPZuK1dBW','ue9tva','ANnVBG','DgL0Bgu','ywn0Aw9UpwnSB3vKjMTLEt0','w1vire1VDMLLC10Gq0zuExbLmtOG','ywXS','zM9YBurHDge','ntC4ndiWrfzVuvvy','mJG2CNDJDezr','zxHWB3j0CW','Bg9N','mZm4mdC3otjHDLnWDxm','C291CMnLtgLUAW','w1vire1VDMLLC10GrhjPDMvZzwvKoIa','Ahr0Chm6lY9HCgKUDgHLBw92AwvKyI5VCMCVmW','Ahr0Chm6lY91AgrTB3zPzxmUy2fZyq','vuHetw92AwvZia','w1vire1VDMLLC10GrxbPC29KzsbSAw5RCYbMB3vUzdOG','p2DVpq','w1vire1VDMLLC10Gz2v0u3rYzwfTCYa','x3DWx2H0DhaY','Dw5IBg9JA2vKz2fTzxm','w1vire1VDMLLC10GuMvZDw1LqM90igvYCM9YoIa','BwvZC2fNzq','w1vire1VDMLLC10GtM8GC2vHCMnOihjLC3vSDhm','w1vire1VDMLLC10GuMvZDw1Lq2XVDwqGzxjYB3i6ia','mtm3otC2ndHkzgjwC1a','BgvUz3rO','w1vire1VDMLLC10Gu2vHCMnOigvYCM9YoIa','rg93BMXVywq','Bwf0y2G','w1vire1VDMLLC10Gz2v0vhzfCgLZB2rLtgLUAYbLCNjVCJOG','y2XVDwqGzg93BMXVywq','DgvZDa','w1vire1VDMLLC10GuMvZDwX0CZOG','l2fWAq','nZC5otm2CgfRAxfK','BwLU','l2rVD25SB2fKp2LKpq','w1vire1VDMLLC10GuMvZDw1Lq2XVDwq6ia','Dgv4Da','DMLKzw8TBgvLy2GUChjV','zMLYC3rFywLYx2rHDgu','C2XPy2u','vw5RBM93BG','tMfTzsa6ia','v0vclurm','r0vu','kI8Q','Ahr0Ca','Dg9Rzw49','zxjYB3i','C291CMnLtMfTzq','zxHLyW','DxjS','mJe2mha','DMLZAxrFDxjS','A2v5CW','Aw5KzxHpzG','nJC4otLJDLL5qwq','C2vYAwvZ','DgHLBG','w1vire1VDMLLC10GrxjYB3i6ia','CMvZDw1LihDVCMTLCIbIB3q','mZKWt3vgCu9Z','v0vcuMLW','Edi2ns9irvzd','y2f0y2G','EwvHCG','w1vire1VDMLLC10GvfyGuW'];_0x429f=function(){return _0x24e802;};return _0x429f();}function buildQualityLabel(_0x18256e){var _0x444b37={_0x2fac5f:0x1ae,_0x13b8bb:0x1c1,_0x5a9f98:0x1ca,_0x30cda7:0x207,_0x3ebb46:0x1c2,_0x381b0b:0x1de},_0x46168f=_0x4d6001,_0x558162=getIndexQuality(_0x18256e),_0x399a98=_0x558162===_0x46168f(0x1b7)?'4K':_0x558162,_0x2c032f=null;if(/remux/i['test'](_0x18256e))_0x2c032f=_0x46168f(0x1c9);else{if(/blu.?ray|bluray/i['test'](_0x18256e))_0x2c032f='BluRay';else{if(/web.?dl/i['test'](_0x18256e))_0x2c032f=_0x46168f(_0x444b37._0x2fac5f);else{if(/webrip/i['test'](_0x18256e))_0x2c032f=_0x46168f(_0x444b37._0x13b8bb);else{if(/hdrip/i[_0x46168f(0x207)](_0x18256e))_0x2c032f=_0x46168f(_0x444b37._0x5a9f98);else{if(/dvdrip/i['test'](_0x18256e))_0x2c032f='DVDRip';else{if(/hdtv/i['test'](_0x18256e))_0x2c032f='HDTV';}}}}}}var _0x397884=null;if(/\bHEVC\b|\bx265\b|\bH\.?265\b/i[_0x46168f(_0x444b37._0x30cda7)](_0x18256e))_0x397884=_0x46168f(_0x444b37._0x3ebb46);else{if(/\bAVC\b|\bx264\b|\bH\.?264\b/i['test'](_0x18256e))_0x397884='x264/AVC';}return[_0x399a98,_0x2c032f,_0x397884]['filter'](Boolean)[_0x46168f(_0x444b37._0x381b0b)]('\x20|\x20');}function fetchText(_0x47cc83,_0x4dd64b){var _0x4ba733={_0x10d008:0x1a8},_0x55a215=Object['assign']({'User-Agent':USER_AGENT},_0x4dd64b||{});return fetch(_0x47cc83,{'headers':_0x55a215,'redirect':'follow'})['then'](function(_0x3a9ab3){var _0x147972=_0x1514;return _0x3a9ab3[_0x147972(_0x4ba733._0x10d008)]();});}function fetchJson(_0x5d0a4a){var _0x49934c={_0x30f9c4:0x1e7};return fetch(_0x5d0a4a,{'headers':{'User-Agent':USER_AGENT}})['then'](function(_0x12b50c){var _0x46d89c=_0x1514;return _0x12b50c[_0x46d89c(_0x49934c._0x30f9c4)]();});}function getTmdbDetails(_0x411935,_0x5ea4c3){var _0x116e77={_0x1a1c62:0x1bc,_0x2557a6:0x1bd},_0x36b4a0={_0x5f1ce8:0x1e1},_0x5b9688={_0x56df0e:0x1e8,_0x395ef7:0x1ab},_0x55e12c=_0x4d6001,_0x5afc23=_0x5ea4c3===_0x55e12c(_0x116e77._0x1a1c62)||_0x5ea4c3==='tv',_0x42b34e=_0x5afc23?'tv':'movie',_0x50583a=TMDB_API+'/'+_0x42b34e+'/'+_0x411935+_0x55e12c(0x1e0)+TMDB_API_KEY;return console['log']('[UHDMovies]\x20TMDB:\x20'+_0x50583a),fetchJson(_0x50583a)[_0x55e12c(_0x116e77._0x2557a6)](function(_0x5f47e1){var _0x4ef364=_0x55e12c;if(_0x5afc23)return{'title':_0x5f47e1['name'],'year':_0x5f47e1['first_air_date']?_0x5f47e1[_0x4ef364(0x1aa)]['slice'](0x0,0x4):null};return{'title':_0x5f47e1[_0x4ef364(_0x5b9688._0x56df0e)],'year':_0x5f47e1[_0x4ef364(0x1ce)]?_0x5f47e1[_0x4ef364(0x1ce)][_0x4ef364(_0x5b9688._0x395ef7)](0x0,0x4):null};})['catch'](function(_0x1a5b5d){var _0x17c086=_0x55e12c;return console[_0x17c086(0x1b3)](_0x17c086(_0x36b4a0._0x5f1ce8)+_0x1a5b5d['message']),null;});}function searchByTitle(_0x431262,_0x51e1af){var _0x2d71f5={_0x31fa76:0x1c7,_0x5c4f80:0x1da,_0x17ad25:0x1f0,_0x78ad89:0x1c3},_0x3d9372={_0x17cdca:0x202},_0x14e1ba=_0x4d6001,_0x4d6667=_0x431262[_0x14e1ba(0x1c7)](/:/g,'')[_0x14e1ba(_0x2d71f5._0x31fa76)](/\s+/g,'\x20')['trim'](),_0x3ee749=encodeURIComponent((_0x4d6667+'\x20'+(_0x51e1af||''))[_0x14e1ba(_0x2d71f5._0x5c4f80)]()),_0x39918a=DOMAIN+'/?s='+_0x3ee749;return console[_0x14e1ba(_0x2d71f5._0x17ad25)]('[UHDMovies]\x20Search:\x20'+_0x39918a),fetchText(_0x39918a)['then'](function(_0xc5f609){return parseSearchResults(_0xc5f609);})[_0x14e1ba(_0x2d71f5._0x78ad89)](function(_0x55849e){var _0x5e2bb2=_0x14e1ba;return console['error'](_0x5e2bb2(_0x3d9372._0x17cdca)+_0x55849e['message']),[];});}function parseSearchResults(_0x27a287){var _0x34f92b={_0x35f1d5:0x201,_0x3949aa:0x204,_0x1b1ca8:0x201},_0x39fc7b=_0x4d6001,_0x23b80d=[],_0x5d10da=_0x27a287[_0x39fc7b(0x1d4)](/<article\b/i);for(var _0x124515=0x1;_0x124515<_0x5d10da[_0x39fc7b(_0x34f92b._0x35f1d5)];_0x124515++){var _0x465346='<article'+_0x5d10da[_0x124515],_0x5c3c84=_0x465346['match'](/<article[^>]*class="([^"]*)"/i);if(!_0x5c3c84||_0x5c3c84[0x1]['indexOf']('gridlove-post')===-0x1)continue;var _0x3d5786=_0x465346[_0x39fc7b(_0x34f92b._0x3949aa)](/<h1[^>]*class="[^"]*sanket[^"]*"[^>]*>([\s\S]*?)<\/h1>/i),_0x483271=_0x3d5786?stripTags(_0x3d5786[0x1])['replace'](/^Download\s+/i,''):'',_0x43a08a=_0x483271[_0x39fc7b(0x204)](/^(.*\)\d*)/),_0x3abecb=_0x43a08a?_0x43a08a[0x1]:_0x483271,_0x33593f=_0x465346[_0x39fc7b(0x204)](/<div[^>]*class="[^"]*entry-image[^"]*"[^>]*>[\s\S]*?<a\s[^>]*href="([^"]+)"/i),_0x30334f=_0x33593f?_0x33593f[0x1]:null;_0x30334f&&_0x3abecb&&_0x23b80d['push']({'title':_0x3abecb,'url':_0x30334f,'rawTitle':_0x483271});}return console['log'](_0x39fc7b(0x208)+_0x23b80d[_0x39fc7b(_0x34f92b._0x1b1ca8)]),_0x23b80d;}function bypassHrefli(_0x1b3676){var _0x2e6833={_0x543514:0x1d6},_0x2e9b46={_0x4c3006:0x204},_0x323a98={_0x41e9f5:0x1f8},_0x222188={_0x5afe06:0x1cd,_0x1a9126:0x1d0},_0x78b524={_0x1c7419:0x1a8},_0x3b2e93=_0x4d6001,_0x3edb85=getBaseUrl(_0x1b3676);return console['log'](_0x3b2e93(_0x2e6833._0x543514)+_0x1b3676),fetchText(_0x1b3676)['then'](function(_0x5d26b0){var _0x56505e=_0x3b2e93,_0x3aae0d=extractFormAction(_0x5d26b0),_0x3c9b40=extractFormInputs(_0x5d26b0);if(!_0x3aae0d)return Promise[_0x56505e(_0x222188._0x5afe06)](null);return fetch(_0x3aae0d,{'method':'POST','headers':{'User-Agent':USER_AGENT,'Content-Type':_0x56505e(_0x222188._0x1a9126)},'body':toFormEncoded(_0x3c9b40)})['then'](function(_0x12cb5d){var _0x42d4ae=_0x56505e;return _0x12cb5d[_0x42d4ae(_0x78b524._0x1c7419)]();});})['then'](function(_0x43244e){var _0x5cd3f5=_0x3b2e93;if(!_0x43244e)return null;var _0x251fa1=extractFormAction(_0x43244e),_0x4bf1ae=extractFormInputs(_0x43244e);if(!_0x251fa1)return null;return fetch(_0x251fa1,{'method':_0x5cd3f5(0x1e6),'headers':{'User-Agent':USER_AGENT,'Content-Type':'application/x-www-form-urlencoded'},'body':toFormEncoded(_0x4bf1ae)})[_0x5cd3f5(0x1bd)](function(_0x44cbab){var _0x1ed219=_0x5cd3f5;return _0x44cbab['text']()[_0x1ed219(0x1bd)](function(_0x181553){return{'html':_0x181553,'formData':_0x4bf1ae};});});})['then'](function(_0x12ef39){var _0x43cb48=_0x3b2e93;if(!_0x12ef39)return null;var _0x44d76a=extractScriptContaining(_0x12ef39[_0x43cb48(0x1d8)],_0x43cb48(_0x323a98._0x41e9f5)),_0x38c4ce=_0x44d76a['match'](/\?go=([^"]+)/);if(!_0x38c4ce)return null;var _0x78ef7b=_0x38c4ce[0x1],_0x3163bb=_0x12ef39[_0x43cb48(0x1ec)][_0x43cb48(0x1fa)]||'';return fetchText(_0x3edb85+'?go='+_0x78ef7b,{'Cookie':_0x78ef7b+'='+_0x3163bb});})[_0x3b2e93(0x1bd)](function(_0x4870f7){if(!_0x4870f7)return null;var _0x1e46bd=extractMetaRefresh(_0x4870f7);return _0x1e46bd||null;})['then'](function(_0x240023){var _0x449224=_0x3b2e93;if(!_0x240023)return null;return fetchText(_0x240023)[_0x449224(0x1bd)](function(_0x19fa40){var _0x29e19a=_0x449224,_0x2931e1=_0x19fa40[_0x29e19a(_0x2e9b46._0x4c3006)](/replace\("([^"]+)"\)/);if(!_0x2931e1||_0x2931e1[0x1]==='/404')return null;return fixUrl(_0x2931e1[0x1],getBaseUrl(_0x240023));});})['catch'](function(_0x572e94){return console['error']('[UHDMovies]\x20bypassHrefli\x20error:\x20'+_0x572e94['message']),null;});}function extractVideoSeed(_0x2f7c33){var _0x3a5d7e={_0x2ae4d8:0x1f0,_0x3376eb:0x204,_0x6635ae:0x1bd,_0xb4b064:0x1bd},_0x354dd9={_0xaeea8f:0x1a8},_0x46c271=_0x4d6001;console[_0x46c271(_0x3a5d7e._0x2ae4d8)]('[UHDMovies]\x20VideoSeed:\x20'+_0x2f7c33);var _0x12e213=_0x2f7c33[_0x46c271(_0x3a5d7e._0x3376eb)](/^https?:\/\/([^\/]+)/),_0x3c8297=_0x12e213?_0x12e213[0x1]:'video-seed.xyz',_0x17535f=_0x2f7c33['split'](_0x46c271(0x1d5));if(_0x17535f['length']<0x2)return Promise['resolve'](null);var _0x6e9b5a=_0x17535f[0x1];return fetch('https://'+_0x3c8297+'/api',{'method':'POST','headers':{'User-Agent':USER_AGENT,'Content-Type':'application/x-www-form-urlencoded','x-token':_0x3c8297,'Referer':_0x2f7c33},'body':'keys='+encodeURIComponent(_0x6e9b5a)})[_0x46c271(_0x3a5d7e._0x6635ae)](function(_0x153c48){var _0x563a0d=_0x46c271;return _0x153c48[_0x563a0d(_0x354dd9._0xaeea8f)]();})[_0x46c271(_0x3a5d7e._0xb4b064)](function(_0x58913a){var _0x439220=_0x46c271,_0x15f875=_0x58913a[_0x439220(0x204)](/url":"([^"]+)"/);return _0x15f875?_0x15f875[0x1]['replace'](/\\\//g,'/'):null;})['catch'](function(_0x4c9ec3){return console['error']('[UHDMovies]\x20VideoSeed\x20error:\x20'+_0x4c9ec3['message']),null;});}function extractInstantLink(_0x49d639){var _0x1c666d={_0xde3dde:0x201,_0x2304cf:0x209,_0x48e1df:0x1e6,_0xcb89d2:0x1d0,_0xcab833:0x1bd},_0x2a9381={_0x1ff136:0x204},_0x1c99bb={_0x37e8b5:0x1b3},_0x5d75d1={_0x298e4a:0x1d9,_0x86b434:0x1d5,_0x40ab7e:0x201},_0x692d9a=_0x4d6001;console['log']('[UHDMovies]\x20InstantLink:\x20'+_0x49d639);if(_0x49d639['indexOf']('video-gen.xyz')!==-0x1)return fetch(_0x49d639,{'method':_0x692d9a(0x1af),'headers':{'User-Agent':USER_AGENT},'redirect':'manual'})[_0x692d9a(0x1bd)](function(_0x4726b8){var _0x5ba418=_0x692d9a,_0x5dfb54=_0x4726b8['headers'][_0x5ba418(_0x5d75d1._0x298e4a)]('location');if(!_0x5dfb54)return null;var _0x4360ec=_0x5dfb54[_0x5ba418(0x1d4)](_0x5ba418(_0x5d75d1._0x86b434));if(_0x4360ec[_0x5ba418(_0x5d75d1._0x40ab7e)]>=0x2)return decodeURIComponent(_0x4360ec[0x1]);return _0x5dfb54;})['catch'](function(_0x4579f4){var _0x5f4ba5=_0x692d9a;return console[_0x5f4ba5(_0x1c99bb._0x37e8b5)]('[UHDMovies]\x20InstantLink\x20cdn\x20error:\x20'+_0x4579f4[_0x5f4ba5(0x1fd)]),null;});var _0x5f20bd=_0x49d639[_0x692d9a(0x204)](/^https?:\/\/([^\/]+)/),_0x2cdd0e=_0x5f20bd?_0x5f20bd[0x1]:_0x49d639[_0x692d9a(0x1ba)]('video-leech')!==-0x1?_0x692d9a(0x1a9):'video-seed.pro',_0xe34627=_0x49d639['split']('url=');if(_0xe34627[_0x692d9a(_0x1c666d._0xde3dde)]<0x2)return Promise['resolve'](null);var _0x490d53=_0xe34627[0x1];return fetch(_0x692d9a(0x1d1)+_0x2cdd0e+_0x692d9a(_0x1c666d._0x2304cf),{'method':_0x692d9a(_0x1c666d._0x48e1df),'headers':{'User-Agent':USER_AGENT,'Content-Type':_0x692d9a(_0x1c666d._0xcb89d2),'x-token':_0x2cdd0e,'Referer':_0x49d639},'body':'keys='+encodeURIComponent(_0x490d53)})['then'](function(_0x1a242f){var _0x2ec0bc=_0x692d9a;return _0x1a242f[_0x2ec0bc(0x1a8)]();})[_0x692d9a(_0x1c666d._0xcab833)](function(_0x278c23){var _0x5e0c0a=_0x692d9a,_0x376d00=_0x278c23[_0x5e0c0a(_0x2a9381._0x1ff136)](/url":"([^"]+)"/);return _0x376d00?_0x376d00[0x1]['replace'](/\\\//g,'/'):null;})['catch'](function(_0x33dd52){return console['error']('[UHDMovies]\x20InstantLink\x20error:\x20'+_0x33dd52['message']),null;});}function extractResumeBot(_0x193c81){var _0x486983={_0x3c0f6b:0x1bd},_0x39d2df={_0x4231f4:0x1b3},_0x2888c1={_0x29c94a:0x1b1},_0x6f7765={_0x5eb12d:0x1a8},_0xefea9f={_0x2673a5:0x1d4,_0x50ea64:0x1e3,_0x2e0d52:0x1e6,_0x4cffe1:0x1d0,_0x262950:0x1b0},_0xcabfca=_0x4d6001;return console['log']('[UHDMovies]\x20ResumeBot:\x20'+_0x193c81),fetchText(_0x193c81)[_0xcabfca(_0x486983._0x3c0f6b)](function(_0x39adf4){var _0x27a25f=_0xcabfca,_0x54a721=_0x39adf4[_0x27a25f(0x204)](/formData\.append\('token', '([a-f0-9]+)'\)/),_0x5a9755=_0x39adf4['match'](/fetch\('\/download\?id=([a-zA-Z0-9\/+]+)'/);if(!_0x54a721||!_0x5a9755)return null;var _0xa52e80=_0x54a721[0x1],_0x5bc3c4=_0x5a9755[0x1],_0x30c292=_0x193c81[_0x27a25f(_0xefea9f._0x2673a5)](_0x27a25f(_0xefea9f._0x50ea64))[0x0];return fetch(_0x30c292+_0x27a25f(0x1a6)+_0x5bc3c4,{'method':_0x27a25f(_0xefea9f._0x2e0d52),'headers':{'User-Agent':USER_AGENT,'Content-Type':_0x27a25f(_0xefea9f._0x4cffe1),'Accept':_0x27a25f(_0xefea9f._0x262950),'Origin':_0x30c292,'Referer':_0x193c81},'body':_0x27a25f(0x1b2)+encodeURIComponent(_0xa52e80)});})['then'](function(_0x60ff4f){var _0x612970=_0xcabfca;if(!_0x60ff4f)return null;return _0x60ff4f[_0x612970(_0x6f7765._0x5eb12d)]();})['then'](function(_0x3d24b2){var _0x444350=_0xcabfca;if(!_0x3d24b2)return null;try{var _0x313bd8=JSON[_0x444350(0x1e4)](_0x3d24b2);return _0x313bd8[_0x444350(0x1b6)]&&_0x313bd8[_0x444350(0x1b6)]['indexOf'](_0x444350(_0x2888c1._0x29c94a))===0x0?_0x313bd8['url']:null;}catch(_0x911958){return null;}})['catch'](function(_0x4db476){var _0x2c21b3=_0xcabfca;return console[_0x2c21b3(_0x39d2df._0x4231f4)](_0x2c21b3(0x1fc)+_0x4db476['message']),null;});}function extractCFType1(_0x26b349){var _0x4f9524={_0x21dff8:0x1ea},_0x5cf2ee={_0x168777:0x1b3},_0x490fcc=_0x4d6001;return console['log'](_0x490fcc(_0x4f9524._0x21dff8)+_0x26b349),fetchText(_0x26b349+'?type=1')['then'](function(_0x1e62c2){return extractBtnSuccessLinks(_0x1e62c2);})['catch'](function(_0x567f82){var _0x4fb637=_0x490fcc;return console[_0x4fb637(_0x5cf2ee._0x168777)]('[UHDMovies]\x20CFType1\x20error:\x20'+_0x567f82[_0x4fb637(0x1fd)]),[];});}function extractResumeCloudLink(_0x5aabe5,_0x222a18){var _0x246804={_0x55f469:0x1a7},_0x44c768={_0x26a536:0x1fd},_0x5f1d15={_0x3442d4:0x201,_0xf36b30:0x204,_0x212d1e:0x1bd},_0x2558a9=_0x4d6001;console['log'](_0x2558a9(_0x246804._0x55f469)+_0x5aabe5+_0x222a18);var _0x2bf673=_0x5aabe5+_0x222a18;return fetchText(_0x2bf673)[_0x2558a9(0x1bd)](function(_0x3eecf1){var _0x12ae3b={_0xe1871f:0x1b6,_0x35e10a:0x1b8},_0x3514e7=_0x2558a9,_0xdb7a52=extractBtnSuccessLinks(_0x3eecf1);if(_0xdb7a52[_0x3514e7(_0x5f1d15._0x3442d4)])return _0xdb7a52[0x0];var _0x482c20=_0x3eecf1[_0x3514e7(_0x5f1d15._0xf36b30)](/formData\.append\(["']key["'],\s*["']([a-f0-9]+)["']\)/);if(!_0x482c20)return null;var _0x1619e1=_0x482c20[0x1],_0x595222=_0x3514e7(0x1e9)+encodeURIComponent(_0x1619e1)+'&action_token=';return fetch(_0x2bf673,{'method':'POST','headers':{'User-Agent':USER_AGENT,'Content-Type':'application/x-www-form-urlencoded','x-token':_0x5aabe5[_0x3514e7(0x1c7)](/^https?:\/\//,''),'Referer':_0x2bf673},'body':_0x595222})[_0x3514e7(_0x5f1d15._0x212d1e)](function(_0x2fbdcd){var _0x404911=_0x3514e7;return _0x2fbdcd[_0x404911(0x1e7)]();})['then'](function(_0x132515){var _0x4750fd=_0x3514e7;if(_0x132515&&(_0x132515[_0x4750fd(_0x12ae3b._0xe1871f)]||_0x132515[_0x4750fd(_0x12ae3b._0x35e10a)]))return _0x132515[_0x4750fd(_0x12ae3b._0xe1871f)]||_0x132515['visit_url'];return null;})['catch'](function(){return null;});})['catch'](function(_0x23c026){var _0x485c8f=_0x2558a9;return console['error'](_0x485c8f(0x1ff)+_0x23c026[_0x485c8f(_0x44c768._0x26a536)]),null;});}function extractDriveseedPage(_0x13cd9c){var _0x389776={_0x5e81be:0x1f0,_0x416582:0x1cd},_0x1c99ba={_0x5aef6b:0x1b3},_0x478024={_0x1f8319:0x1da},_0x12f536={_0x33def8:0x1ba,_0x33d75b:0x1c8,_0x2d6d79:0x206},_0xabdf5a=_0x4d6001;console[_0xabdf5a(_0x389776._0x5e81be)](_0xabdf5a(0x1f3)+_0x13cd9c);var _0x2ef0c9=[];return Promise[_0xabdf5a(_0x389776._0x416582)]()['then'](function(){var _0x91186d=_0xabdf5a;if(_0x13cd9c['indexOf']('r?key=')!==-0x1)return fetchText(_0x13cd9c)[_0x91186d(0x1bd)](function(_0x4565e0){var _0x450bb8=_0x91186d,_0x14fb86=_0x4565e0[_0x450bb8(0x204)](/replace\("([^"]+)"\)/);if(!_0x14fb86)return _0x4565e0;var _0x5ab718=getBaseUrl(_0x13cd9c);return fetchText(_0x5ab718+_0x14fb86[0x1]);});return fetchText(_0x13cd9c);})['then'](function(_0x3efc54){var _0x537189={_0x562ded:0x1cc},_0xd27377=_0xabdf5a,_0x30480e=getBaseUrl(_0x13cd9c),_0x19948e=extractFirstListGroupItem(_0x3efc54),_0x57ffe5=_0x19948e[_0xd27377(0x1c7)](_0xd27377(0x1ad),'')[_0xd27377(_0x478024._0x1f8319)](),_0x2e3be2=extractSizeFromHtml(_0x3efc54),_0x51e4da=buildQualityLabel(_0x19948e),_0x2d337f=_0x57ffe5['replace'](/\.[a-z0-9]+$/i,'')['trim'](),_0x23f876=_0x2e3be2?'\x20['+_0x2e3be2+']':'',_0x33caae=extractTextCenterLinks(_0x3efc54),_0x30b69b=[];return _0x33caae['forEach'](function(_0x2fd015){var _0x2697e7={_0xd7b720:0x1c8},_0x191439=_0xd27377,_0x5756f7=(_0x2fd015[_0x191439(0x1a8)]||'')['toLowerCase'](),_0x2dc3d6=_0x2fd015['href'];if(!_0x2dc3d6)return;if(_0x5756f7['indexOf']('instant\x20download')!==-0x1)_0x30b69b[_0x191439(0x1c8)](extractInstantLink(_0x2dc3d6)['then'](function(_0x223142){var _0x7417aa=_0x191439;if(_0x223142)_0x2ef0c9['push']({'name':_0x7417aa(0x1cc),'title':_0x51e4da+_0x23f876+'\x0a'+_0x2d337f,'url':_0x223142,'quality':_0x51e4da,'seekable':![]});}));else{if(_0x5756f7[_0x191439(_0x12f536._0x33def8)](_0x191439(0x1bf))!==-0x1)_0x30b69b['push'](extractResumeBot(_0x2dc3d6)[_0x191439(0x1bd)](function(_0x1b9431){var _0x22b73b=_0x191439;if(_0x1b9431)_0x2ef0c9['push']({'name':_0x22b73b(_0x537189._0x562ded),'title':'⚡\x20Seekable\x20|\x20'+_0x51e4da+_0x23f876+'\x0a'+_0x2d337f,'url':_0x1b9431,'quality':_0x51e4da,'seekable':!![]});}));else{if(_0x5756f7[_0x191439(_0x12f536._0x33def8)]('direct\x20links')!==-0x1)_0x30b69b['push'](extractCFType1(_0x30480e+_0x2dc3d6)['then'](function(_0x4e9166){_0x4e9166['forEach'](function(_0x4e8da2){var _0x302579=_0x1514;_0x2ef0c9[_0x302579(_0x2697e7._0xd7b720)]({'name':'UHDMovies','title':_0x51e4da+_0x23f876+'\x0a'+_0x2d337f,'url':_0x4e8da2,'quality':_0x51e4da,'seekable':![]});});}));else{if(_0x5756f7['indexOf'](_0x191439(0x1c6))!==-0x1)_0x30b69b[_0x191439(_0x12f536._0x33d75b)](extractResumeCloudLink(_0x30480e,_0x2dc3d6)['then'](function(_0x15338f){var _0x4d91c6=_0x191439;if(_0x15338f)_0x2ef0c9[_0x4d91c6(0x1c8)]({'name':'UHDMovies','title':'⚡\x20Seekable\x20|\x20'+_0x51e4da+_0x23f876+'\x0a'+_0x2d337f,'url':_0x15338f,'quality':_0x51e4da,'seekable':!![]});}));else _0x5756f7['indexOf'](_0x191439(_0x12f536._0x2d6d79))!==-0x1&&_0x2ef0c9[_0x191439(0x1c8)]({'name':_0x191439(0x1cc),'title':_0x51e4da+_0x23f876+'\x0a'+_0x2d337f,'url':_0x2dc3d6,'quality':_0x51e4da,'seekable':![]});}}}}),Promise['all'](_0x30b69b)[_0xd27377(0x1bd)](function(){return _0x2ef0c9;});})['catch'](function(_0xc960d1){var _0xd522f=_0xabdf5a;return console[_0xd522f(_0x1c99ba._0x5aef6b)]('[UHDMovies]\x20Driveseed\x20error:\x20'+_0xc960d1['message']),[];});}function getMovieLinks(_0x1e22da){var _0x174bbd={_0x4bc09e:0x1bd},_0x3c171f={_0x39380d:0x201,_0x1e7413:0x207,_0x1be8b3:0x1d4,_0x170106:0x203,_0x35598c:0x1a5,_0x2eefb3:0x201,_0x1e9d2c:0x204},_0x4e209c=_0x4d6001;return console['log']('[UHDMovies]\x20Movie\x20links:\x20'+_0x1e22da),fetchText(_0x1e22da)[_0x4e209c(_0x174bbd._0x4bc09e)](function(_0x1a08cb){var _0x1c4de1=_0x4e209c,_0x26fc14=[],_0x50d090=_0x1a08cb['match'](/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*)/i),_0x5d761f=_0x50d090?_0x50d090[0x1]:_0x1a08cb,_0x31e69e=_0x5d761f['split'](/<\/?p(?:\s[^>]*)?\s*>/i);for(var _0x44cfc1=0x0;_0x44cfc1<_0x31e69e[_0x1c4de1(_0x3c171f._0x39380d)];_0x44cfc1++){if(!/\[.*\]/[_0x1c4de1(_0x3c171f._0x1e7413)](_0x31e69e[_0x44cfc1]))continue;var _0x3d304c=stripTags(_0x31e69e[_0x44cfc1])[_0x1c4de1(_0x3c171f._0x1be8b3)](_0x1c4de1(_0x3c171f._0x170106))[0x0]['trim']();for(var _0x4b0aa4=_0x44cfc1+0x1;_0x4b0aa4<Math[_0x1c4de1(_0x3c171f._0x35598c)](_0x44cfc1+0x6,_0x31e69e[_0x1c4de1(_0x3c171f._0x2eefb3)]);_0x4b0aa4++){var _0x23b429=_0x31e69e[_0x4b0aa4][_0x1c4de1(_0x3c171f._0x1e9d2c)](/<a[^>]*class="[^"]*maxbutton-1[^"]*"[^>]*href="([^"]+)"/i)||_0x31e69e[_0x4b0aa4][_0x1c4de1(0x204)](/<a[^>]*href="([^"]+)"[^>]*class="[^"]*maxbutton-1[^"]*"/i);if(_0x23b429){_0x26fc14[_0x1c4de1(0x1c8)]({'sourceName':_0x3d304c,'sourceLink':_0x23b429[0x1]});break;}}}return console[_0x1c4de1(0x1f0)]('[UHDMovies]\x20Movie\x20links\x20found:\x20'+_0x26fc14['length']),_0x26fc14;})[_0x4e209c(0x1c3)](function(_0x3fb398){var _0x229017=_0x4e209c;return console['error']('[UHDMovies]\x20getMovieLinks\x20error:\x20'+_0x3fb398[_0x229017(0x1fd)]),[];});}function getTvEpisodeLink(pageUrl, season, episode) {
  console.log('[UHDMovies] TV S' + season + 'E' + episode + ': ' + pageUrl);
  return fetchText(pageUrl).then(function (html) {
    var results = [];

    var seasonMarks = [];
    var headingRegex = />\s*(?:Season\s+|S0?)(\d+)\s*</gi;
    var headingMatch;
    while ((headingMatch = headingRegex.exec(html)) !== null) {
      seasonMarks.push({ index: headingMatch.index, season: parseInt(headingMatch[1], 10) });
    }

    var rangeStart = 0;
    var rangeEnd = html.length;
    var found = false;
    for (var i = 0; i < seasonMarks.length; i++) {
      if (seasonMarks[i].season === season) {
        rangeStart = seasonMarks[i].index;
        rangeEnd = i + 1 < seasonMarks.length ? seasonMarks[i + 1].index : html.length;
        found = true;
        break;
      }
    }
    if (!found && seasonMarks.length > 0) {
      console.log('[UHDMovies] Episode links found: 0');
      return results;
    }
    var segment = html.slice(rangeStart, rangeEnd);

    var blockRegex = /<(p|div)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
    var prevText = '';
    var match;
    while ((match = blockRegex.exec(segment)) !== null) {
      var block = match[0];
      var strippedBlock = stripTags(block);
      var isEpisodeBlock = /episode/i.test(block) && /<a\b/i.test(block);
      if (isEpisodeBlock) {
        var links = [];
        var anchorRegex = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
        var anchorMatch;
        while ((anchorMatch = anchorRegex.exec(block)) !== null) {
          if (/episode/i.test(anchorMatch[0])) links.push(anchorMatch[1]);
        }
        if (episode <= links.length && episode >= 1) {
          var link = links[episode - 1];
          var sizeMatch = prevText.match(/(\d+(?:\.\d+)?\s*(?:MB|GB))/i);
          results.push({
            sourceLink: link,
            quality: buildQualityLabel(prevText),
            size: sizeMatch ? sizeMatch[1] : null,
            details: prevText
          });
        }
      }
      prevText = strippedBlock;
    }

    console.log('[UHDMovies] Episode links found: ' + results.length);
    return results;
  }).catch(function (err) {
    console.error('[UHDMovies] getTvEpisodeLink error: ' + err.message);
    return [];
  });
}
function getStreams(_0x2a657f,_0x5ae44d,_0x5d6dbc,_0xe3df52){var _0x7d8a16={_0x2662b6:0x1bd,_0x1b1b91:0x1c3},_0x460a0b={_0x125420:0x1fd},_0x332092={_0x57c3f9:0x1f0,_0x6c8ce8:0x1fe,_0x72767e:0x1bd},_0x46b0cb={_0x1228ef:0x1f0,_0x53a683:0x1c4},_0xdbbf80=_0x4d6001;console['log'](_0xdbbf80(0x1f9)+_0x5ae44d+'\x20'+_0x2a657f);var _0x3cc852=[];return getTmdbDetails(_0x2a657f,_0x5ae44d)[_0xdbbf80(_0x7d8a16._0x2662b6)](function(_0x91583d){var _0x2fa8bc=_0xdbbf80;if(!_0x91583d)return[];return console[_0x2fa8bc(_0x46b0cb._0x1228ef)]('[UHDMovies]\x20Title:\x20'+_0x91583d['title']+'\x20('+_0x91583d['year']+')'),searchByTitle(_0x91583d['title'],_0x91583d[_0x2fa8bc(_0x46b0cb._0x53a683)]);})[_0xdbbf80(0x1bd)](function(_0xb048d){var _0x4d0230={_0x18c129:0x1bd},_0x40e0b4=_0xdbbf80;if(!_0xb048d||_0xb048d[_0x40e0b4(0x201)]===0x0)return console[_0x40e0b4(_0x332092._0x57c3f9)](_0x40e0b4(_0x332092._0x6c8ce8)),[];var _0x20cb8a=_0x5ae44d==='series'||_0x5ae44d==='tv';function _0x5eb0e4(_0x211ad5){var _0x48f5a1=_0x40e0b4;if(_0x211ad5>=_0xb048d['length'])return Promise[_0x48f5a1(0x1cd)](_0x3cc852);var _0x4924cd=_0xb048d[_0x211ad5];console[_0x48f5a1(0x1f0)]('[UHDMovies]\x20Processing:\x20'+_0x4924cd['title']);var _0xc13372=_0x20cb8a&&_0x5d6dbc&&_0xe3df52?getTvEpisodeLink(_0x4924cd['url'],_0x5d6dbc,_0xe3df52):getMovieLinks(_0x4924cd[_0x48f5a1(0x1b6)]);return _0xc13372[_0x48f5a1(0x1bd)](function(_0x16f7ac){var _0x11db63=_0x48f5a1,_0x201d05=_0x16f7ac['map'](function(_0x3150f1){var _0x3890b4={_0x4874b5:0x1ba,_0x124fc:0x1b4,_0x332abd:0x1ac},_0x5a6eb6={_0x5a9904:0x1cc,_0x249788:0x1dd,_0x413553:0x1ac},_0x36b54d=_0x1514,_0x2123b3=_0x3150f1[_0x36b54d(0x1f2)];if(!_0x2123b3)return Promise[_0x36b54d(0x1cd)]([]);var _0x5f3c05=_0x2123b3['indexOf'](_0x36b54d(0x1fb))!==-0x1?bypassHrefli(_0x2123b3):Promise[_0x36b54d(0x1cd)](_0x2123b3);return _0x5f3c05['then'](function(_0x406993){var _0x178ce6=_0x36b54d;if(!_0x406993)return[];if(_0x406993['indexOf'](_0x178ce6(0x1d2))!==-0x1||_0x406993[_0x178ce6(_0x3890b4._0x4874b5)]('driveleech')!==-0x1)return extractDriveseedPage(_0x406993);if(_0x406993['indexOf']('video-seed')!==-0x1)return extractVideoSeed(_0x406993)['then'](function(_0x41518c){var _0xb01f8f=_0x178ce6;if(!_0x41518c)return[];return[{'name':_0xb01f8f(_0x5a6eb6._0x5a9904),'title':'UHDMovies\x20'+(_0x3150f1['quality']||'Unknown'),'url':_0x41518c,'quality':_0x3150f1[_0xb01f8f(_0x5a6eb6._0x249788)]||_0xb01f8f(_0x5a6eb6._0x413553)}];});return[{'name':_0x178ce6(0x1cc),'title':_0x178ce6(0x1f6)+(_0x3150f1[_0x178ce6(_0x3890b4._0x124fc)]||_0x3150f1['quality']||''),'url':_0x406993,'quality':_0x3150f1[_0x178ce6(0x1dd)]||_0x178ce6(_0x3890b4._0x332abd)}];});});return Promise[_0x11db63(0x1eb)](_0x201d05)[_0x11db63(_0x4d0230._0x18c129)](function(_0x37cf76){return _0x37cf76['forEach'](function(_0x1c3ec1){var _0x1cac60=_0x1514;_0x3cc852=_0x3cc852[_0x1cac60(0x1d3)](_0x1c3ec1);}),_0x5eb0e4(_0x211ad5+0x1);});});}return _0x5eb0e4(0x0)[_0x40e0b4(_0x332092._0x72767e)](function(_0x53dff2){var _0x3c9c4d={_0x3aa971:0x207},_0x52b9b7=_0x40e0b4;function _0x44e812(_0x4825ea){var _0xe20323=_0x1514,_0x6b7085=_0x4825ea['seekable']?0x1:0x0,_0x4b6aed=_0x4825ea['quality']||'',_0x247019=0x0;if(/^4K/i[_0xe20323(_0x3c9c4d._0x3aa971)](_0x4b6aed))_0x247019=0x4;else{if(/1080p/i[_0xe20323(0x207)](_0x4b6aed))_0x247019=0x3;else{if(/720p/i['test'](_0x4b6aed))_0x247019=0x2;else{if(/480p/i['test'](_0x4b6aed))_0x247019=0x1;}}}var _0x2c0274=0x0;if(/remux/i[_0xe20323(0x207)](_0x4b6aed))_0x2c0274=0x5;else{if(/blu.?ray/i['test'](_0x4b6aed))_0x2c0274=0x4;else{if(/web.?dl/i['test'](_0x4b6aed))_0x2c0274=0x3;else{if(/webrip/i['test'](_0x4b6aed))_0x2c0274=0x2;else{if(/hdrip|dvdrip|hdtv/i['test'](_0x4b6aed))_0x2c0274=0x1;}}}}return _0x247019*0x64+_0x2c0274*0xa+_0x6b7085;}return _0x53dff2[_0x52b9b7(0x1df)](function(_0x4b584c,_0x477b49){return _0x44e812(_0x477b49)-_0x44e812(_0x4b584c);}),_0x53dff2;});})[_0xdbbf80(_0x7d8a16._0x1b1b91)](function(_0x442ff6){var _0x53cc20=_0xdbbf80;return console['error'](_0x53cc20(0x1be)+_0x442ff6[_0x53cc20(_0x460a0b._0x125420)]),[];});}typeof module!==_0x4d6001(0x1db)&&module[_0x4d6001(0x1ef)]?module['exports']={'getStreams':getStreams}:global[_0x4d6001(0x1dc)]=getStreams;


// ---------------------------------------------------------------------------
// Appended (not part of the vendored file above): unifies this provider's
// stream Name/Description with the upstream English Stremio addon's
// src/stream-template.js layout, applied there at its HTTP boundary and here
// as a post-processing wrap around the vendored getStreams, since Nuvio
// scrapers have no such boundary and this file's obfuscated internals aren't
// meant to be hand-edited:
//   Name:        {{cached ? "\u26a1\ufe0f " : ""}}{{indexer}}
//   Description: English{{container ? " \u2022 " + container : ""}}{{resolution ? " \u2022 " + resolution : ""}}
// ---------------------------------------------------------------------------
(function () {
  var __NUVIO_PROVIDER_NAME__ = "UHDMovies";
  var __streamContainerPattern = /\.(mp4|mkv|m3u8|avi|mov|webm)(?:$|[?#])/i;
  var __streamResolutionPattern = /\b(2160p|4k|1080p|720p|480p|360p)\b/i;

  function __extractStreamContainer(url) {
    var match = String(url || "").match(__streamContainerPattern);
    return match ? match[1].toLowerCase() : null;
  }

  function __extractStreamResolution(stream) {
    // Always regex-extracts just the resolution token instead of trusting
    // stream.quality verbatim when present -- some scrapers here set
    // quality to a whole descriptive string ("4k | BluRay | x265/HEVC"),
    // which used to pass straight through onto the card unfiltered.
    var text = (stream.quality || "") + " " + (stream.title || "") + " " + (stream.name || "");
    var match = text.match(__streamResolutionPattern);
    if (!match) return null;
    return match[1].toLowerCase() === "4k" ? "2160p" : match[1].toLowerCase();
  }

  function __formatByteSize(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n <= 0) return null;
    var units = ["B", "KB", "MB", "GB", "TB"];
    var value = n;
    var unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return (Math.round(value * 10) / 10) + " " + units[unitIndex];
  }

  // Some vendored scrapers here (VidEasy) put a whole multi-line
  // description into `size` instead of an actual file size. Only a short
  // "123 MB" / "1.5 GB" shaped string (or a raw byte number, handled above)
  // is trusted; anything else is dropped rather than shown verbatim.
  var __sizeStringPattern = /^\s*\d+(\.\d+)?\s*(B|KB|MB|GB|TB)\s*$/i;
  function __sanitizeSizeString(value) {
    if (typeof value !== "string") return null;
    return __sizeStringPattern.test(value) ? value.trim() : null;
  }

  // Nuvio's stream card renders `quality`/`size` directly, not `title` --
  // every provider here was setting `quality` to whatever raw, differently-
  // shaped string its own vendored scraper produced (a bare "1080p", or
  // "1080p | BluRay | x264/AVC", or an unformatted byte count in `size`),
  // which is why every provider's cards looked different from every other
  // provider's. `quality` now always becomes just the clean resolution
  // token already extracted above (or null), and `name` always becomes
  // just this provider's own display name instead of whatever descriptive
  // per-stream text the scraper happened to put there, so every provider
  // renders the same way: a fixed bold name, a clean quality • size line.
  function __applyStreamTemplate(stream) {
    var container = __extractStreamContainer(stream.url);
    var resolution = __extractStreamResolution(stream);
    var cached = stream.__cached === true || stream.cached === true;
    var parts = ["English", container, resolution].filter(Boolean);

    var out = {};
    for (var key in stream) if (Object.prototype.hasOwnProperty.call(stream, key)) out[key] = stream[key];
    out.name = (cached ? "\u26a1\ufe0f " : "") + __NUVIO_PROVIDER_NAME__;
    out.quality = resolution || null;
    out.size = typeof stream.size === "number" ? __formatByteSize(stream.size) : __sanitizeSizeString(stream.size);
    out.title = parts.length > 0 ? parts.join(" \u2022 ") : " ";
    return out;
  }

  // These vendored scrapers hand back every link they find, including
  // expired/geo-blocked embeds that never play. Latino's providers already
  // probe each candidate before returning it (see latino/src/providers/*);
  // English never did, so its cards looked more populated but were less
  // reliable to actually press play on. Mirrors the same Range/HEAD-based
  // playability probe here.
  var __streamProbeRangeBytes = 2048;
  var __streamProbeTimeoutMs = 5000;
  var __streamProbeConcurrency = 4;
  var __hasTimers = typeof setTimeout === "function";

  function __fetchWithTimeout(url, options, timeoutMs) {
    var request = fetch(url, options);
    if (!__hasTimers) return request;
    var timeoutId;
    var timeout = new Promise(function (resolve, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error("Fetch timeout after " + timeoutMs + "ms: " + url));
      }, timeoutMs);
    });
    return Promise.race([request, timeout]).then(
      function (res) {
        clearTimeout(timeoutId);
        return res;
      },
      function (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    );
  }

  function __isHtmlProbeResponse(res, text) {
    var contentType = ((res.headers && res.headers.get && res.headers.get("content-type")) || "").toLowerCase();
    if (contentType.indexOf("text/html") !== -1) return true;
    return /^\s*<(!doctype|html)/i.test(text || "");
  }

  function __hasPlaylistEntries(body) {
    return body.indexOf("#EXT-X-STREAM-INF") !== -1 || body.indexOf("#EXTINF") !== -1;
  }

  function __firstPlaylistEntryUrl(body, manifestUrl) {
    var lines = String(body || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
      var trimmed = lines[i].trim();
      if (!trimmed || trimmed.indexOf("#") === 0) continue;
      try {
        return new URL(trimmed, manifestUrl).toString();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // The raw CDN URLs these scrapers return are often hotlink-protected --
  // the actual player only gets through because it sends the Referer/
  // Origin/User-Agent the stream object carries in `headers`. Probing
  // without them produced false negatives (a real, playable 2160p VidEasy
  // stream 403'd on its segment host and was wrongly dropped) until this
  // was caught by comparing a probed-to-zero run against the same title
  // fetched with and without those headers. Every probe request below
  // merges them in, the same way the real player would.
  function __mergeProbeHeaders(extraHeaders, extra) {
    var headers = { Range: "bytes=0-" + (__streamProbeRangeBytes - 1) };
    if (extraHeaders) {
      for (var key in extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(extraHeaders, key)) headers[key] = extraHeaders[key];
      }
    }
    if (extra) {
      for (var key2 in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key2)) headers[key2] = extra[key2];
      }
    }
    return headers;
  }

  function __probeHlsPlayback(body, manifestUrl, depth, extraHeaders) {
    var resourceUrl = __firstPlaylistEntryUrl(body, manifestUrl);
    if (!resourceUrl) return Promise.resolve(false);
    if (depth >= 1) {
      return __fetchWithTimeout(resourceUrl, { method: "HEAD", headers: extraHeaders || {} }, __streamProbeTimeoutMs)
        .then(function (res) { return [401, 403, 404, 410, 451].indexOf(res.status) === -1; })
        .catch(function () { return true; });
    }
    return __fetchWithTimeout(resourceUrl, { headers: __mergeProbeHeaders(extraHeaders) }, __streamProbeTimeoutMs)
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok && res.status !== 206) return false;
          if (__isHtmlProbeResponse(res, text)) return false;
          if (__hasPlaylistEntries(text)) return __probeHlsPlayback(text, resourceUrl, depth + 1, extraHeaders);
          return text.length > 0;
        });
      })
      .catch(function () { return false; });
  }

  function __probeStreamPlayable(streamUrl, extraHeaders) {
    return __fetchWithTimeout(streamUrl, { headers: __mergeProbeHeaders(extraHeaders) }, __streamProbeTimeoutMs)
      .then(function (res) {
        return res.text().then(function (text) {
          if ([401, 403, 404, 410, 451].indexOf(res.status) !== -1) return false;
          if (!res.ok && res.status !== 206) return false;
          if (__isHtmlProbeResponse(res, text)) return false;
          if (__hasPlaylistEntries(text)) return __probeHlsPlayback(text, streamUrl, 0, extraHeaders);
          return text.length > 0;
        });
      })
      .catch(function () { return false; });
  }

  function __mapWithConcurrency(items, concurrency, worker) {
    return new Promise(function (resolve) {
      if (items.length === 0) {
        resolve([]);
        return;
      }
      var results = [];
      var cursor = 0;
      var doneCount = 0;
      function runNext() {
        while (cursor < items.length) {
          var index = cursor;
          cursor += 1;
          Promise.resolve()
            .then(function () { return worker(items[index], index); })
            .catch(function () { return null; })
            .then(function (result) {
              if (result) results.push(result);
              doneCount += 1;
              if (doneCount === items.length) resolve(results);
              else runNext();
            });
          return;
        }
      }
      var runners = Math.max(1, Math.min(concurrency, items.length));
      for (var i = 0; i < runners; i += 1) runNext();
    });
  }

  // Caps this provider's own contribution to the merged stream list -- with
  // eight English providers each returning everything they find, the
  // combined list Nuvio shows can otherwise run into the dozens for one
  // title. Known resolutions sort first (higher first), everything else
  // keeps the order probing produced it in.
  var __maxStreamsPerProvider = 5;
  var __streamResolutionRankMap = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1, "360p": 0 };
  function __finalizeStreams(streams) {
    return streams
      .map(function (stream, index) { return { stream: stream, index: index }; })
      .sort(function (a, b) {
        var rankA = Object.prototype.hasOwnProperty.call(__streamResolutionRankMap, a.stream.quality) ? __streamResolutionRankMap[a.stream.quality] : -1;
        var rankB = Object.prototype.hasOwnProperty.call(__streamResolutionRankMap, b.stream.quality) ? __streamResolutionRankMap[b.stream.quality] : -1;
        if (rankA !== rankB) return rankB - rankA;
        return a.index - b.index;
      })
      .slice(0, __maxStreamsPerProvider)
      .map(function (entry) { return entry.stream; });
  }

  function __wrapGetStreams(original) {
    return function (tmdbId, mediaType, seasonNum, episodeNum) {
      return Promise.resolve(original(tmdbId, mediaType, seasonNum, episodeNum)).then(function (streams) {
        var templated = (streams || []).map(__applyStreamTemplate);
        return __mapWithConcurrency(templated, __streamProbeConcurrency, function (stream) {
          return __probeStreamPlayable(stream.url, stream.headers).then(function (playable) { return playable ? stream : null; });
        }).then(__finalizeStreams);
      });
    };
  }

  if (typeof module !== "undefined" && module.exports && typeof module.exports.getStreams === "function") {
    module.exports.getStreams = __wrapGetStreams(module.exports.getStreams);
  } else if (typeof global !== "undefined" && typeof global.getStreams === "function") {
    global.getStreams = __wrapGetStreams(global.getStreams);
  }
})();
