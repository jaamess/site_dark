const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require("discord.js");
const app = express();
const port = 80;
let config = require('./config.js');
const auditLog = [];

const client = new Client({
  intents: Object.keys(GatewayIntentBits).map((a) => {
    return GatewayIntentBits[a];
  }),
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/music/');
  },
  filename: (req, file, cb) => {
    cb(null, 'music.mp3');
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /mp3/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: File upload only supports the following filetypes - ' + filetypes);
    }
  }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.set('views', './views');
app.set('view engine', 'ejs');
app.use(express.static('./public'));

client.on('ready', async () => {
  console.log(`[+] bot on como ${client.user.username}`);
});

app.get('/admin', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin', (req, res) => {
  const { usuario, password } = req.body;
  console.log(`Received usuario: ${usuario}, password: ${password}`);

  const user = config.users[usuario];

  if (!user) {
    console.error(`User not found: ${usuario}`);
  } else if (user.password !== password) {
    console.error(`Invalid password for user: ${usuario}`);
    console.log(`Stored password: ${user.password}, Entered password: ${password}`);
  }

  if (user && user.password === password) {
    console.log(`Login successful for user: ${usuario}`);
    req.session.authenticated = true;
    req.session.role = user.role;
    req.session.usuario = usuario;

    if (user.mustChangePassword) {
      return res.redirect('/admin/change-password');
    }

    res.redirect('/admin/settings');
  } else {
    console.log('Login failed due to incorrect credentials.');
    res.render('login', { error: 'Verifique se a senha e/ou usuário digitado está correto.' });
  }
});

app.get('/admin/change-password', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }
  res.render('change-password', { error: null });
});

app.post('/admin/change-password', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.render('change-password', { error: 'Passwords do not match' });
  }

  const usuario = req.session.usuario;
  config.users[usuario].password = newPassword;
  config.users[usuario].mustChangePassword = false;

  fs.writeFileSync('./config.js', `module.exports = ${JSON.stringify(config, null, 2)};`);

  res.redirect('/admin/settings');
});

app.get('/admin/settings', async (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const userRole = req.session.role;
  const permissions = config.userRoles[userRole] || {};

  res.render('settings', { config, permissions });
});

app.post('/admin/settings', upload.single('music_upload'), (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const userRole = req.session.role;
  const permissions = config.userRoles[userRole] || {};

  if (permissions.canEditServer) {
    config.server = req.body.config.server;
  }

  if (permissions.canEditPage) {
    config.pagina = req.body.config.pagina;
  }

  if (permissions.canEditBot) {
    config.bot = req.body.config.bot;
  }

  if (permissions.canUploadMusic && req.file) {
    console.log(`Uploaded file: ${req.file.filename}`);
  }

  fs.writeFileSync('./config.js', `module.exports = ${JSON.stringify(config, null, 2)};`);
  auditLog.push({ timestamp: new Date(), changes: req.body.config });

  res.redirect('/admin/settings');
});

app.get('/admin/users', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const userRole = req.session.role;
  const permissions = config.userRoles[userRole] || {};

  if (!permissions.canManageUsers) {
    return res.status(403).sendFile(path.join(__dirname, 'views', '403.html'));
  }

  res.render('users', { users: config.users, permissions });
});

app.post('/admin/users/add', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const userRole = req.session.role;
  const permissions = config.userRoles[userRole] || {};

  if (!permissions.canManageUsers) {
    return res.status(403).sendFile(path.join(__dirname, 'views', '403.html'));
  }

  const { usuario, password, role } = req.body;

  if (config.users[usuario]) {
    return res.status(400).send('User already exists');
  }

  config.users[usuario] = { password, role, mustChangePassword: true };

  fs.writeFileSync('./config.js', `module.exports = ${JSON.stringify(config, null, 2)};`);

  res.redirect('/admin/users');
});

app.post('/admin/users/edit', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const userRole = req.session.role;
  const permissions = config.userRoles[userRole] || {};

  if (!permissions.canManageUsers) {
    return res.status(403).sendFile(path.join(__dirname, 'views', '403.html'));
  }

  const { usuario, password, role } = req.body;

  if (!config.users[usuario]) {
    return res.status(400).send('User does not exist');
  }

  if (password) {
    config.users[usuario].password = password;
    config.users[usuario].mustChangePassword = true;
  }

  if (role) {
    config.users[usuario].role = role;
  }

  fs.writeFileSync('./config.js', `module.exports = ${JSON.stringify(config, null, 2)};`);

  res.redirect('/admin/users');
});

app.post('/admin/users/delete', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/admin');
  }

  const userRole = req.session.role;
  const permissions = config.userRoles[userRole] || {};

  if (!permissions.canManageUsers) {
    return res.status(403).sendFile(path.join(__dirname, 'views', '403.html'));
  }

  const { usuario } = req.body;

  if (!config.users[usuario]) {
    return res.status(400).send('User does not exist');
  }

  delete config.users[usuario];

  fs.writeFileSync('./config.js', `module.exports = ${JSON.stringify(config, null, 2)};`);

  res.redirect('/admin/users');
});

app.get('/fetch-username/:userId', async (req, res) => {
  if (!req.session.authenticated) {
    return res.status(403).json({ error: 'Not authenticated' });
  }
  try {
    const user = await client.users.fetch(req.params.userId);
    res.json({ username: user.username });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin');
});

app.get('/', async (req, res) => {
  var users = {};
  var server = null;
  var sv = config.server;

  if (sv.ativado == true) {
    server = await client.guilds.fetch(sv.id).catch(err => null);
  }

  function getIconLabels(userId) {
    return config.iconLabels ? config.iconLabels[userId] || [] : [];
  }

  let parsedUsuarios;
  try {
    parsedUsuarios = JSON.parse(config.usuarios);
  } catch (error) {
    console.error('Failed to parse usuarios:', error);
    parsedUsuarios = {};
  }

  for (const userId in parsedUsuarios) {
    var usuario;
    try {
      usuario = await client.users.fetch(userId, { force: true });
    } catch (error) {
      console.error(`${userId} é um id inválido`);
      continue;
    }

    var flags = usuario.flags ? usuario.flags.toArray() : [];
    var boostLevel = parsedUsuarios[userId];
    var badges = [];

    for (const flag of flags) {
      badges.push(config.badges[flag]);
    }
    if (boostLevel !== null) {
      badges.push(config.badges.nitro);
    }
    if (boostLevel !== null) {
      var boostImage = config.boost[boostLevel];
      if (boostImage) {
        badges.push(boostImage);
      } else {
        console.log(`O usuário com ID ${userId} não tem boost ou houve um erro.`);
      }
    }

    if (config.usuariosComQuest.includes(usuario.id)) badges.push(config.badges.CompletedQuest);

    users[usuario.id] = {
      info_user: {
        id: usuario.id,
        username: usuario.username,
        discriminator: usuario.discriminator,
        avatar: usuario.displayAvatarURL({ dynamic: true, size: 4096, extension: 'png' })
      },
      badges: badges,
      iconLabels: getIconLabels(usuario.id)
    };
  }

  var site_config = config.pagina;
  res.render('index', { users, site_config, server, sv });
});

client.login(config.bot.token);
app.listen(port, () => {
  console.log(`[+] Servidor iniciado e rodando na porta: ${port}`);
});