const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

/* Mailer */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

/* Middleware */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* PostgreSQL connection */
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        user: process.env.DB_USER || "postgres",
        host: process.env.DB_HOST || "localhost",
        database: process.env.DB_NAME || "makeupp_db",
        password: process.env.DB_PASS || "2311",
        port: process.env.DB_PORT || 5432,
      }
);

/* Create tables if they don't exist */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO users (name, email, password, role) VALUES ('Admin', 'admin@varsha.com', 'varsha123', 'admin')
    ON CONFLICT (email) DO NOTHING
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      fname TEXT NOT NULL,
      lname TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      service TEXT NOT NULL,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      email TEXT,
      service TEXT,
      amount TEXT,
      txn_id TEXT,
      status TEXT DEFAULT 'success',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      service TEXT,
      rating INTEGER DEFAULT 5,
      review TEXT NOT NULL,
      approved BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
  console.log("Tables ready ✅");
}

/* ================= REGISTER ================= */
app.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    await pool.query(
      `INSERT INTO users (name, email, phone, password, role) VALUES ($1,$2,$3,$4,'user')`,
      [name, email, phone, password]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Email already exists.' });
  }
});

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1 AND password=$2 AND role=$3",
      [email, password, role]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, role: result.rows[0].role, name: result.rows[0].name });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= GET ALL USERS (admin) ================= */
app.get("/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id,name,email,phone,role,created_at FROM users ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= MY BOOKINGS (user) ================= */
app.get("/my-bookings", async (req, res) => {
  try {
    const { email } = req.query;
    const result = await pool.query(
      "SELECT * FROM bookings WHERE email=$1 ORDER BY created_at DESC", [email]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= MY MESSAGES (user) ================= */
app.get("/my-messages", async (req, res) => {
  try {
    const { email } = req.query;
    const result = await pool.query(
      "SELECT * FROM messages WHERE email=$1 ORDER BY created_at DESC", [email]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= CONFIRM BOOKING (admin) ================= */
app.post("/confirm-booking", async (req, res) => {
  try {
    const { id, email, fname, service, date, slot } = req.body;
    await pool.query("UPDATE bookings SET status='confirmed' WHERE id=$1", [id]);
    await transporter.sendMail({
      from: '"Varsha Pawar Makeup" <geetakasture2311@gmail.com>',
      to: email,
      subject: "Your Booking is Confirmed! 💄",
      html: `
        <div style="font-family:Georgia,serif;max-width:500px;margin:0 auto;padding:32px;border:1px solid #f0d0da;background:#fdf8f8;">
          <h2 style="font-size:28px;font-weight:300;color:#1a0d12;">Booking <em style="color:#d4547a;">Confirmed!</em></h2>
          <p style="color:#8a6070;font-size:14px;line-height:1.8;margin:16px 0;">Dear ${fname},<br/>Your appointment with Varsha Pawar has been confirmed.</p>
          <div style="background:#fce8ef;padding:20px;border:1px solid #f0d0da;margin:20px 0;">
            <p style="font-size:12px;color:#8a6070;margin-bottom:4px;">SERVICE</p>
            <p style="font-size:15px;color:#1a0d12;margin-bottom:12px;">${service}</p>
            <p style="font-size:12px;color:#8a6070;margin-bottom:4px;">DATE</p>
            <p style="font-size:15px;color:#1a0d12;margin-bottom:12px;">${date}</p>
            <p style="font-size:12px;color:#8a6070;margin-bottom:4px;">TIME SLOT</p>
            <p style="font-size:15px;color:#d4547a;">${slot}</p>
          </div>
          <p style="color:#8a6070;font-size:13px;line-height:1.8;">For any queries, contact Varsha on WhatsApp or reply to this email.</p>
          <p style="margin-top:24px;font-size:12px;color:#c96b8a;letter-spacing:2px;text-transform:uppercase;">Varsha Pawar · Makeup Artist · Nashik</p>
        </div>`
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Confirm error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= REVIEWS ================= */
app.post("/review", async (req, res) => {
  try {
    const { name, service, rating, review } = req.body;
    await pool.query(
      `INSERT INTO reviews (name, service, rating, review) VALUES ($1,$2,$3,$4)`,
      [name, service, rating, review]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/reviews", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM reviews WHERE approved=true ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/reviews/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM reviews ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/reviews/approve", async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("UPDATE reviews SET approved=true WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.delete("/reviews/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM reviews WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= BOOKING ================= */
app.post("/payment", async (req, res) => {
  try {
    const { email, service, amount, txn_id, status } = req.body;
    await pool.query(
      `INSERT INTO payments (email, service, amount, txn_id, status) VALUES ($1,$2,$3,$4,$5)`,
      [email, service, amount, txn_id, status]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= BOOKING ================= */
app.post("/book", async (req, res) => {
  try {
    const { fname, lname, phone, email, service, date, slot, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO bookings (fname, lname, phone, email, service, date, slot, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [fname, lname, phone, email, service, date, slot, notes]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Booking error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= CONTACT ================= */
app.post("/contact", async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;
    const result = await pool.query(
      `INSERT INTO messages (name, phone, email, subject, message)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, phone, email, subject, message]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Contact error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= GET ALL BOOKINGS (admin) ================= */
app.get("/bookings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bookings ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= GET ALL MESSAGES (admin) ================= */
app.get("/messages", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM messages ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= SCHEDULE (admin) ================= */
app.get("/schedule", async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = "SELECT * FROM bookings WHERE 1=1";
    const params = [];
    if (from) { params.push(from); query += ` AND date >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND date <= $${params.length}`; }
    query += " ORDER BY date ASC, slot ASC";
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* START */
pool.connect()
  .then(() => {
    console.log("Database connected ✅");
    return initDB();
  })
  .then(() => {
    app.listen(process.env.PORT || 3000, () => {
      console.log(`Server running on port ${process.env.PORT || 3000} 🚀`);
    });
  })
  .catch(err => {
    console.error("DB connection failed ❌", err.message);
    process.exit(1);
  });
