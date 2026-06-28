from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import uuid
from datetime import datetime
import tempfile

app = Flask(__name__)

# Konfigurasi CORS
if os.environ.get('VERCEL'):
    CORS(app, origins=['https://your-domain.vercel.app'])  # Ganti dengan domain mu
else:
    CORS(app)  # Development

# Konfigurasi folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USE_TMP = bool(os.environ.get('VERCEL'))  # True jika di Vercel

UPLOAD_FOLDER = '/tmp/uploads' if USE_TMP else os.path.join(BASE_DIR, 'uploads')
RESULTS_FOLDER = '/tmp/results' if USE_TMP else os.path.join(BASE_DIR, 'results')
DATABASE_FILE = '/tmp/analysis_history.json' if USE_TMP else os.path.join(BASE_DIR, 'analysis_history.json')

app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['RESULTS_FOLDER'] = RESULTS_FOLDER
app.config['ALLOWED_EXTENSIONS'] = {'mp4', 'avi', 'mov', 'mkv', 'webm', 'mp3', 'wav'}

# Buat folder
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)

def load_database():
    """Load database dari file JSON"""
    if os.path.exists(DATABASE_FILE):
        with open(DATABASE_FILE, 'r') as f:
            return json.load(f)
    return {'history': [], 'next_id': 1}

def save_database(data):
    """Save database ke file JSON"""
    with open(DATABASE_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def allowed_file(filename):
    """Cek apakah ekstensi file diizinkan"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.route('/')
def index():
    """Halaman utama"""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_video():
    """Endpoint untuk upload video"""
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'Tidak ada file video'}), 400
        
        file = request.files['video']
        if file.filename == '':
            return jsonify({'error': 'File tidak dipilih'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Format file tidak didukung'}), 400
        
        # Generate unique filename
        original_filename = file.filename
        file_extension = original_filename.rsplit('.', 1)[1].lower()
        unique_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        new_filename = f"{timestamp}_{unique_id}.{file_extension}"
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
        file.save(filepath)
        
        # Simpan info ke database
        db = load_database()
        analysis_id = db['next_id']
        db['next_id'] += 1
        
        history_entry = {
            'id': analysis_id,
            'filename': new_filename,
            'original_filename': original_filename,
            'upload_time': datetime.now().isoformat(),
            'file_size': os.path.getsize(filepath),
            'status': 'uploaded',
            'results': None
        }
        db['history'].append(history_entry)
        save_database(db)
        
        return jsonify({
            'success': True,
            'filename': new_filename,
            'original_filename': original_filename,
            'analysis_id': analysis_id,
            'message': 'Video berhasil diupload'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_video():
    """Endpoint untuk analisis video"""
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'Data tidak valid'}), 400
        
        analysis_id = data.get('analysis_id')
        results = data.get('results')
        filename = data.get('filename')
        
        if not analysis_id or not results:
            return jsonify({'error': 'Data tidak lengkap'}), 400
        
        # Update database
        db = load_database()
        found = False
        
        for entry in db['history']:
            if entry['id'] == analysis_id:
                entry['status'] = 'completed'
                entry['results'] = results
                entry['analysis_time'] = datetime.now().isoformat()
                found = True
                break
        
        if not found:
            return jsonify({'error': 'ID analisis tidak ditemukan'}), 404
        
        save_database(db)
        
        # Simpan hasil ke file terpisah
        result_filename = f"result_{analysis_id}.json"
        result_path = os.path.join(app.config['RESULTS_FOLDER'], result_filename)
        with open(result_path, 'w') as f:
            json.dump({
                'analysis_id': analysis_id,
                'filename': filename,
                'timestamp': datetime.now().isoformat(),
                'results': results
            }, f, indent=2)
        
        return jsonify({
            'success': True,
            'message': 'Hasil analisis berhasil disimpan',
            'analysis_id': analysis_id
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/history', methods=['GET'])
def get_history():
    """Endpoint untuk mendapatkan riwayat analisis"""
    try:
        db = load_database()
        history = db['history'][::-1]
        return jsonify({
            'success': True,
            'history': history
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/history/<int:analysis_id>', methods=['GET'])
def get_analysis_detail(analysis_id):
    """Endpoint untuk mendapatkan detail analisis tertentu"""
    try:
        db = load_database()
        for entry in db['history']:
            if entry['id'] == analysis_id:
                return jsonify({
                    'success': True,
                    'data': entry
                })
        return jsonify({'error': 'Analisis tidak ditemukan'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/result/<int:analysis_id>', methods=['GET'])
def get_result_file(analysis_id):
    """Endpoint untuk mengambil file hasil analisis"""
    try:
        result_filename = f"result_{analysis_id}.json"
        result_path = os.path.join(app.config['RESULTS_FOLDER'], result_filename)
        
        if os.path.exists(result_path):
            with open(result_path, 'r') as f:
                data = json.load(f)
            return jsonify({
                'success': True,
                'data': data
            })
        else:
            return jsonify({'error': 'File hasil tidak ditemukan'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/video/<filename>', methods=['GET'])
def get_video(filename):
    """Endpoint untuk mengambil file video"""
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        return jsonify({'error': 'File tidak ditemukan'}), 404

@app.route('/delete/<int:analysis_id>', methods=['DELETE'])
def delete_analysis(analysis_id):
    """Endpoint untuk menghapus analisis dan file terkait"""
    try:
        db = load_database()
        entry_to_delete = None
        
        for entry in db['history']:
            if entry['id'] == analysis_id:
                entry_to_delete = entry
                break
        
        if not entry_to_delete:
            return jsonify({'error': 'Analisis tidak ditemukan'}), 404
        
        db['history'] = [entry for entry in db['history'] if entry['id'] != analysis_id]
        save_database(db)
        
        # Hapus file video
        video_path = os.path.join(app.config['UPLOAD_FOLDER'], entry_to_delete['filename'])
        if os.path.exists(video_path):
            os.remove(video_path)
        
        # Hapus file hasil
        result_path = os.path.join(app.config['RESULTS_FOLDER'], f"result_{analysis_id}.json")
        if os.path.exists(result_path):
            os.remove(result_path)
        
        return jsonify({
            'success': True,
            'message': 'Analisis berhasil dihapus'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Endpoint untuk mendapatkan statistik"""
    try:
        db = load_database()
        total = len(db['history'])
        completed = sum(1 for entry in db['history'] if entry.get('status') == 'completed')
        uploaded = sum(1 for entry in db['history'] if entry.get('status') == 'uploaded')
        
        total_size = 0
        for entry in db['history']:
            total_size += entry.get('file_size', 0)
        
        return jsonify({
            'success': True,
            'stats': {
                'total_analyses': total,
                'completed': completed,
                'pending': uploaded,
                'total_size_mb': round(total_size / (1024 * 1024), 2)
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Handler untuk Vercel - ini yang akan dipanggil
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File terlalu besar. Maksimal 500MB'}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint tidak ditemukan'}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Terjadi kesalahan internal server'}), 500

# Untuk development lokal
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)