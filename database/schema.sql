-- ============================================
-- Club and Events Management System
-- Database Schema + Sample Data
-- ============================================

CREATE DATABASE IF NOT EXISTS club_management_db;
USE club_management_db;

-- ============================================
-- STUDENT Table
-- ============================================
CREATE TABLE IF NOT EXISTS STUDENT (
    student_id INT PRIMARY KEY AUTO_INCREMENT,
    fname VARCHAR(50) NOT NULL,
    lname VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    branch VARCHAR(50) NOT NULL
);

-- ============================================
-- CLUB Table
-- ============================================
CREATE TABLE IF NOT EXISTS CLUB (
    club_id INT PRIMARY KEY AUTO_INCREMENT,
    club_name VARCHAR(100) NOT NULL
);

-- ============================================
-- EVENT Table
-- ============================================
CREATE TABLE IF NOT EXISTS EVENT (
    event_id INT PRIMARY KEY AUTO_INCREMENT,
    event_name VARCHAR(100) NOT NULL,
    event_date DATE NOT NULL,
    location VARCHAR(100) NOT NULL,
    club_id INT NOT NULL,
    FOREIGN KEY (club_id) REFERENCES CLUB(club_id) ON DELETE CASCADE
);

-- ============================================
-- REGISTRATION Table (resolves Student ↔ Event M:N)
-- ============================================
CREATE TABLE IF NOT EXISTS REGISTRATION (
    reg_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    event_id INT NOT NULL,
    entry_fee DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES EVENT(event_id) ON DELETE CASCADE
);

-- ============================================
-- Sample Data: STUDENT (5 rows)
-- ============================================
INSERT INTO STUDENT (fname, lname, year, branch) VALUES
('Aarav', 'Sharma', 2, 'Computer Science'),
('Priya', 'Patel', 3, 'Electronics'),
('Rohan', 'Gupta', 1, 'Mechanical'),
('Sneha', 'Reddy', 4, 'Information Technology'),
('Vikram', 'Singh', 2, 'Civil Engineering');

-- ============================================
-- Sample Data: CLUB (5 rows)
-- ============================================
INSERT INTO CLUB (club_name) VALUES
('Coding Club'),
('Robotics Club'),
('Literary Society'),
('Music Club'),
('Sports Club');

-- ============================================
-- Sample Data: EVENT (5 rows)
-- ============================================
INSERT INTO EVENT (event_name, event_date, location, club_id) VALUES
('Hackathon 2026', '2026-06-15', 'Main Auditorium', 1),
('RoboWars', '2026-07-20', 'Tech Arena', 2),
('Poetry Slam', '2026-06-01', 'Library Hall', 3),
('Battle of Bands', '2026-08-10', 'Open Air Theatre', 4),
('Inter-College Cricket', '2026-09-05', 'Sports Ground', 5);

-- ============================================
-- Sample Data: REGISTRATION (5 rows)
-- ============================================
INSERT INTO REGISTRATION (student_id, event_id, entry_fee) VALUES
(1, 1, 200.00),
(2, 3, 50.00),
(3, 2, 150.00),
(4, 5, 100.00),
(5, 4, 75.00);
