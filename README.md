# Wedding Planner Backend API

A robust Express.js backend API for the Wedding Planner application with MongoDB integration and JWT authentication.

## Features

- 🔐 **Secure Authentication** - JWT-based user authentication with bcrypt password hashing
- 👤 **User Management** - User registration, login, and profile management
- 🛡️ **Protected Routes** - Middleware for securing API endpoints
- 📊 **MongoDB Integration** - NoSQL database with Mongoose ODM
- ✅ **Input Validation** - Express-validator for request validation
- 🌐 **CORS Support** - Cross-origin resource sharing configuration
- 📝 **Error Handling** - Comprehensive error handling and logging

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

## Setup Instructions

```sh
# Step 1: Navigate to the backend directory
cd wedding-backend

# Step 2: Install dependencies
npm install

# Step 3: Set up environment variables
cp .env.copy .env
# Edit .env file with your configuration

# Step 4: Start MongoDB (if running locally)
# Make sure MongoDB is running on your system

# Step 5: Start the development server
npm run dev
```

The API will be available at `http://localhost:5000`

## Environment Variables

Copy `.env.copy` to `.env` and configure:

- `MONGODB_URI` - MongoDB connection string (default: mongodb://localhost:27017/wedding-planner)
- `JWT_SECRET` - Secret key for JWT token signing (change in production!)
- `JWT_EXPIRES_IN` - JWT token expiration time (default: 7d)
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode (development/production)
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:5173)

## API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/register`

Register a new user account.

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "gender": "male"
}
```

**Response:**

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "gender": "male",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt_token_here"
  }
}
```

#### POST `/login`

Authenticate user and return JWT token.

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "gender": "male"
    },
    "token": "jwt_token_here"
  }
}
```

#### GET `/profile`

Get current user profile (requires authentication).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "gender": "male"
    }
  }
}
```

#### GET `/verify`

Verify JWT token validity (requires authentication).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "success": true,
  "message": "Token is valid",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "gender": "male"
    }
  }
}
```

### Health Check

#### GET `/api/health`

Check API health status.

**Response:**

```json
{
  "success": true,
  "message": "Wedding Planner API is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Database Schema

### User Model

```javascript
{
  name: String (required, min: 2 characters),
  email: String (required, unique, valid email format),
  password: String (required, min: 6 characters, hashed with bcrypt),
  gender: String (required, enum: ['male', 'female', 'other', 'prefer-not-to-say']),
  createdAt: Date (auto-generated),
  updatedAt: Date (auto-updated)
}
```

## Security Features

- **Password Hashing**: Uses bcrypt with salt rounds of 12
- **JWT Tokens**: Secure token-based authentication
- **Input Validation**: Comprehensive validation using express-validator
- **CORS Protection**: Configurable cross-origin resource sharing
- **Error Handling**: Secure error responses without sensitive data exposure

## Development

```sh
# Start development server with nodemon
npm run dev

# Start production server
npm start

# Install new dependencies
npm install <package-name>
```

## Project Structure

```
wedding-backend/
├── config/
│   └── database.js      # MongoDB connection configuration
├── middleware/
│   └── auth.js          # JWT authentication middleware
├── models/
│   └── User.js          # User model with Mongoose schema
├── routes/
│   └── auth.js          # Authentication routes
├── .env                 # Environment variables (not in git)
├── .env.copy            # Environment variables template
├── package.json         # Dependencies and scripts
├── server.js            # Main server file
└── README.md            # This file
```

## Error Handling

The API includes comprehensive error handling:

- **Validation Errors**: 400 status with detailed validation messages
- **Authentication Errors**: 401 status for invalid/missing tokens
- **Not Found Errors**: 404 status for non-existent routes
- **Server Errors**: 500 status for internal server errors
- **Conflict Errors**: 409 status for duplicate resources (e.g., existing email)

## Production Deployment

1. Set `NODE_ENV=production` in your environment variables
2. Use a strong, unique `JWT_SECRET`
3. Configure a production MongoDB instance
4. Set up proper CORS origins for your frontend domain
5. Use a process manager like PM2 for production deployment
6. Set up SSL/HTTPS for secure communication

## Technologies Used

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Validation**: express-validator
- **CORS**: cors middleware
- **Environment**: dotenv
- **Development**: nodemon
