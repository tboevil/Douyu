var express = require('express');
var router = express.Router();
var authentication = require('../authentication');
let getAllUser = require('../middleware/Dao').getAllUser;
let delUserByUsername = require('../middleware/Dao').delUserByUsername;
let findOneByUser = require('../middleware/Dao').findOneByUser;
let modifyUser = require('../middleware/Dao').modifyUser;
let queryDanmuByUser = require('../middleware/Dao').queryDanmuByUser;
let queryDanmuByUid = require('../middleware/Dao').queryDanmuByUid;
let GetMuteList = require('../middleware/Dao').GetMuteList;



router.get('/danmu', (req, res, next) => {
  req.roles = {
    query: 3
  }
  next();
}, authentication.role, (req, res) => {
  let douyunn = req.query.douyunn || "";
  let only = req.query.only || "";
  if (douyunn) {
    let cur = req.query.cur * 20 || 0;
    queryDanmuByUser(douyunn, cur).then((results) => {
        if (results.total == 0) res.status(404).send("未找到记录");
        else res.status(200).send(results);
      })
      .catch((err) => {
        console.log(err);
      })
  } else {
    let uid = req.query.uid || "";
    queryDanmuByUid(uid).then((results) => {
        if (results.total == 0) res.status(404).send("未找到记录");
        else res.status(200).send(results);
      })
      .catch((err) => {
        console.log(err);
      })
  }

})


router.get('/allUser', (req, res, next) => {
  req.roles = {
    manager: 3
  }
  next();
}, authentication.role, (req, res) => {
  let cur = req.query.cur * 20 || 0;
  getAllUser(cur)
    .then((results) => {
      res.status(200).send(results);
    })
    .catch((err) => {
      console.log(err);
    })
});

router.delete('/user', (req, res, next) => {
  req.roles = {
    manager: 3
  }
  next();
}, authentication.role, (req, res) => {
  let username = req.query.username || "";
  findOneByUser(username)
    .then((results) => {
      if (!results) {
        res.status(403).send('未找到该用户');
      } else {
        delUserByUsername(username)
          .then((result) => {
            res.status(200).send('删除成功');
          })
          .catch((err) => {
            console.log(err);
            res.status(500).send(err);
          })
      }
    })
})

router.put('/user', (req, res, next) => {
  req.roles = {
    manager: 3
  }
  next();
}, (req, res) => {
  let username = req.body.username || "";
  let role = req.body.role || "";
  findOneByUser(username)
    .then((results) => {
      if (!results) {
        res.status(403).send('未找到该用户');
      } else {
        modifyUser(username, role)
          .then((result) => {
            res.status(200).send('修改成功');
          })
          .catch((err) => {
            console.log(err);
            res.status(500).send(err);
          })
      }
    })
})








router.get('/mute', (req, res, next) => {
  req.roles = {
    manager: 3
  }
  next();
}, authentication.role, (req, res, next) => {

  var data = {
    nnList: [],
    countList: []
  }
  GetMuteList()
    .then((results) => {
      res.json(results)
    })
});

module.exports = router;
