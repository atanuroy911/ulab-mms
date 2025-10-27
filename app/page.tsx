'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Student, Exam, MarksData } from './types';
import { parseCSV, generateCSV, downloadCSV } from './utils/csv';
import { saveToLocalStorage, loadFromLocalStorage, exportToJSON, importFromJSON } from './utils/storage';
import { 
  applyBellCurveScaling, 
  applyLinearNormalization, 
  applyMinMaxNormalization, 
  applyPercentileScaling,
  applyRounding 
} from './utils/scaling';

export default function Home() {
  const [data, setData] = useState<MarksData>({ students: [], exams: [] });
  const [csvInput, setCsvInput] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [markInput, setMarkInput] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showScalingInfo, setShowScalingInfo] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [lastSessionData, setLastSessionData] = useState<MarksData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markInputRef = useRef<HTMLInputElement>(null);

  // Check for existing session on mount
  useEffect(() => {
    const stored = loadFromLocalStorage();
    if (stored && (stored.students.length > 0 || stored.exams.length > 0)) {
      setLastSessionData(stored);
      setShowSessionModal(true);
    }
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (data.students.length > 0 || data.exams.length > 0) {
      saveToLocalStorage(data);
    }
  }, [data]);

  const handleResumeSession = () => {
    if (lastSessionData) {
      setData(lastSessionData);
    }
    setShowSessionModal(false);
  };

  const handleStartNewSession = () => {
    localStorage.removeItem('marksData');
    setData({ students: [], exams: [] });
    setShowSessionModal(false);
  };

  const handleImportCSV = () => {
    try {
      const students = parseCSV(csvInput);
      if (students.length === 0) {
        alert('No valid student data found. Please use format: StudentID, StudentName');
        return;
      }
      setData(prev => ({ ...prev, students }));
      setCsvInput('');
      setShowImport(false);
      alert(`Successfully imported ${students.length} students!`);
    } catch (error) {
      alert('Error parsing CSV. Please check the format.');
    }
  };

  const handleAddExam = () => {
    const examName = prompt('Enter exam name:');
    if (!examName) return;

    const totalMarks = prompt('Enter total marks:');
    if (!totalMarks || isNaN(Number(totalMarks))) {
      alert('Invalid total marks');
      return;
    }

    const scalingValue = prompt('Enter final scaling value (maximum):');
    if (!scalingValue || isNaN(Number(scalingValue))) {
      alert('Invalid scaling value');
      return;
    }

    const newExam: Exam = {
      id: Date.now().toString(),
      name: examName,
      totalMarks: Number(totalMarks),
      scalingValue: Number(scalingValue),
      scalingMethod: 'bellCurve' // Default method
    };

    setData(prev => ({
      ...prev,
      exams: [...prev.exams, newExam]
    }));
  };

  const handleApplyScaling = (examId: string, method: 'bellCurve' | 'linearNormalization' | 'minMaxNormalization' | 'percentile') => {
    const exam = data.exams.find(e => e.id === examId);
    if (!exam) return;

    let scaledStudents: Student[];
    
    switch (method) {
      case 'bellCurve':
        scaledStudents = applyBellCurveScaling(data.students, exam);
        break;
      case 'linearNormalization':
        scaledStudents = applyLinearNormalization(data.students, exam);
        break;
      case 'minMaxNormalization':
        scaledStudents = applyMinMaxNormalization(data.students, exam);
        break;
      case 'percentile':
        scaledStudents = applyPercentileScaling(data.students, exam);
        break;
      default:
        scaledStudents = data.students;
    }

    // Update exam with the scaling method used
    const updatedExams = data.exams.map(e => 
      e.id === examId ? { ...e, scalingMethod: method } : e
    );

    setData(prev => ({ 
      students: scaledStudents,
      exams: updatedExams
    }));
    
    alert(`${getScalingMethodName(method)} applied to ${exam.name}!`);
  };

  const handleApplyRounding = (examId: string) => {
    const exam = data.exams.find(e => e.id === examId);
    if (!exam) return;

    const roundedStudents = applyRounding(data.students, examId, true);
    setData(prev => ({ ...prev, students: roundedStudents }));
    
    alert(`Rounding applied to ${exam.name}!`);
  };

  const getScalingMethodName = (method?: string) => {
    switch (method) {
      case 'bellCurve': return 'Bell Curve (Z-Score)';
      case 'linearNormalization': return 'Linear Normalization';
      case 'minMaxNormalization': return 'Min-Max Normalization';
      case 'percentile': return 'Percentile-Based';
      default: return 'Not Applied';
    }
  };

  const handleAddMark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedExam || !markInput) return;

    const mark = Number(markInput);
    if (isNaN(mark)) {
      alert('Invalid mark value');
      return;
    }

    // Add the raw mark
    const updatedStudents = data.students.map(s =>
      s.id === selectedStudent.id
        ? { ...s, marks: { ...s.marks, [selectedExam]: mark } }
        : s
    );

    setData(prev => ({ ...prev, students: updatedStudents }));
    setMarkInput('');
    setSearchQuery('');
    setSelectedStudent(null);
    setSelectedExam('');
    setEditMode(false);
    alert(editMode ? 'Mark updated successfully!' : 'Mark added successfully! It will be scaled when you apply bell curve.');
  };

  const handleEditMark = (student: Student, examId: string) => {
    setSelectedStudent(student);
    setSelectedExam(examId);
    setMarkInput(student.marks[examId]?.toString() || '');
    setEditMode(true);
    // Scroll to the marks entry section
    setTimeout(() => {
      markInputRef.current?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleCancelEdit = () => {
    setSelectedStudent(null);
    setSelectedExam('');
    setMarkInput('');
    setEditMode(false);
    setSearchQuery('');
  };

  const handleExportCSV = () => {
    const csv = generateCSV(data.students, data.exams);
    downloadCSV(csv, `marks-export-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleExportJSON = () => {
    exportToJSON(data);
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const importedData = await importFromJSON(file);
      setData(importedData);
      alert('Data imported successfully!');
    } catch (error) {
      alert('Error importing JSON file');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredStudents = data.students.filter(s =>
    s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student);
    setSearchQuery('');
    setEditMode(false);
    setSelectedExam('');
    setMarkInput('');
    // Focus on mark input after selection
    setTimeout(() => markInputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredStudents.length === 1) {
        handleStudentSelect(filteredStudents[0]);
      }
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900' : 'bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50'}`}>
      {/* Session Recovery Modal */}
      {showSessionModal && lastSessionData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className={`rounded-2xl shadow-2xl max-w-lg w-full border transition-colors ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            {/* Header */}
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
                  <span className="text-2xl">💾</span>
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Last Session Found</h2>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Would you like to continue where you left off?</p>
                </div>
              </div>
            </div>

            {/* Session Details */}
            <div className="p-6 space-y-4">
              <div className={`rounded-lg p-4 border ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Session Details:</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Students:</span>
                    <span className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                      {lastSessionData.students.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Exams:</span>
                    <span className={`text-sm font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>
                      {lastSessionData.exams.length}
                    </span>
                  </div>
                  {lastSessionData.exams.length > 0 && (
                    <div className="pt-2 border-t border-gray-700">
                      <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Exams: </span>
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {lastSessionData.exams.map(e => e.name).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning for new session */}
              <div className={`rounded-lg p-3 border-l-4 ${darkMode ? 'bg-yellow-900/20 border-yellow-600' : 'bg-yellow-50 border-yellow-500'}`}>
                <p className={`text-xs ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                  ⚠️ Starting a new session will permanently delete all existing data
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-700 flex gap-3">
              <button
                onClick={handleResumeSession}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg font-medium"
              >
                📂 Resume Session
              </button>
              <button
                onClick={handleStartNewSession}
                className={`flex-1 px-4 py-3 rounded-lg transition-all font-medium ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                🗑️ Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors ${darkMode ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <Image
                src="/ulab.svg"
                alt="ULAB Logo"
                width={50}
                height={50}
                className="drop-shadow-lg"
              />
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent' : 'text-gray-900'}`}>
                  Marks Management System
                </h1>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  University of Liberal Arts Bangladesh
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Quick Stats */}
              <div className="hidden md:flex items-center gap-4 mr-4">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
                  <span className="text-lg">👨‍🎓</span>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                    {data.students.length}
                  </span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-100'}`}>
                  <span className="text-lg">📝</span>
                  <span className={`text-sm font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-900'}`}>
                    {data.exams.length}
                  </span>
                </div>
              </div>

              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2.5 rounded-lg transition-all ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>

              {/* Export Buttons */}
              <button
                onClick={handleExportJSON}
                className={`px-4 py-2 rounded-lg transition-all font-medium text-sm ${darkMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white'}`}
                disabled={data.students.length === 0}
              >
                💾 JSON
              </button>
              <button
                onClick={handleExportCSV}
                className={`px-4 py-2 rounded-lg transition-all font-medium text-sm ${darkMode ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'}`}
                disabled={data.students.length === 0}
              >
                📊 CSV
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 pt-8">

        {/* Control Panel */}
        <div className={`rounded-xl shadow-2xl p-6 mb-6 border transition-colors ${darkMode ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700/50' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-xl font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            <span className="w-1 h-6 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full"></span>
            Control Panel
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowImport(!showImport)}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-900/50 font-medium"
            >
              📥 Import Students (CSV)
            </button>
            <button
              onClick={handleAddExam}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg shadow-emerald-900/50 font-medium"
            >
              ➕ Add Exam
            </button>
            <label className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all shadow-lg shadow-orange-900/50 cursor-pointer font-medium">
              📂 Import JSON
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>
          </div>

          {/* CSV Import Section */}
          {showImport && (
            <div className={`mt-6 p-4 rounded-lg border transition-colors ${darkMode ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-300'}`}>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Paste CSV (Format: StudentID, StudentName)
              </label>
              <textarea
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                className={`w-full h-32 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${darkMode ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                placeholder="e.g.&#10;S001, John Doe&#10;S002, Jane Smith"
              />
              <button
                onClick={handleImportCSV}
                className="mt-3 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg font-medium"
              >
                ✓ Import
              </button>
            </div>
          )}
        </div>

        {/* Scaling Methods Info Card */}
        <div className={`rounded-xl shadow-lg p-6 mb-6 border transition-colors ${darkMode ? 'bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border-indigo-700/30' : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-semibold flex items-center gap-2 ${darkMode ? 'text-indigo-200' : 'text-indigo-900'}`}>
              <span className="text-xl">📚</span>
              Scaling Methods Explained
            </h3>
            <button
              onClick={() => setShowScalingInfo(!showScalingInfo)}
              className={`px-3 py-1 text-sm rounded-lg transition-all ${darkMode ? 'bg-indigo-600/50 text-indigo-200 hover:bg-indigo-600/70' : 'bg-indigo-200 text-indigo-900 hover:bg-indigo-300'}`}
            >
              {showScalingInfo ? 'Hide' : 'Show'}
            </button>
          </div>
          
          {showScalingInfo && (
            <div className="space-y-4 text-sm">
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/30' : 'bg-white/50'}`}>
                <h4 className={`font-semibold mb-1 ${darkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>🎯 Bell Curve (Z-Score Normalization)</h4>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Uses statistical distribution to scale marks. Calculates mean and standard deviation, then normalizes using z-scores. Most marks fall within the scaled range while preserving relative performance differences.</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Formula: scaled = (scalingValue/2) + (z-score × scalingValue/6)</p>
              </div>
              
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/30' : 'bg-white/50'}`}>
                <h4 className={`font-semibold mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>📏 Linear Normalization (Proportional)</h4>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Simple proportional scaling. If you score 80/100 on raw marks and scaling is to 50, you get 40/50.</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Formula: scaled = (raw / totalMarks) × scalingValue</p>
              </div>
              
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/30' : 'bg-white/50'}`}>
                <h4 className={`font-semibold mb-1 ${darkMode ? 'text-purple-400' : 'text-purple-700'}`}>⚖️ Min-Max Normalization</h4>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Scales based on actual min and max marks in the class. The lowest scorer gets 0, highest gets scalingValue, others distributed proportionally in between.</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Formula: scaled = ((raw - min) / (max - min)) × scalingValue</p>
              </div>
              
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/30' : 'bg-white/50'}`}>
                <h4 className={`font-semibold mb-1 ${darkMode ? 'text-pink-400' : 'text-pink-700'}`}>📊 Percentile-Based Scaling</h4>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Ranks students and assigns marks based on their position. Top ranker gets scalingValue, bottom gets 0, others distributed by rank position.</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Formula: scaled = (rank / (total - 1)) × scalingValue</p>
              </div>
              
              <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-900/30 border-green-700/30' : 'bg-white/50 border-green-300'}`}>
                <h4 className={`font-semibold mb-1 ${darkMode ? 'text-green-400' : 'text-green-700'}`}>🔢 Rounding</h4>
                <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Converts decimal marks to whole numbers using standard rounding (0.5 rounds up).</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Example: 12.4 → 12, 12.5 → 13, 12.6 → 13</p>
              </div>
            </div>
          )}
        </div>

        {/* Exams List */}
        {data.exams.length > 0 && (
          <div className={`rounded-xl shadow-2xl p-6 mb-6 border transition-colors ${darkMode ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700/50' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-xl font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <span className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full"></span>
              Exams & Scaling
            </h2>
            <div className="space-y-4">
              {data.exams.map(exam => (
                <div key={exam.id} className={`p-4 rounded-lg border transition-all ${darkMode ? 'bg-gray-900/50 border-gray-700/50 hover:border-gray-600' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className={`font-medium text-lg ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{exam.name}</div>
                      <div className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Total Marks: <span className={`font-medium ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{exam.totalMarks}</span> | 
                        Scaling Value: <span className={`font-medium ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>{exam.scalingValue}</span>
                        {exam.scalingMethod && (
                          <span className={`ml-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>| Method: {getScalingMethodName(exam.scalingMethod)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Scaling Methods */}
                    <div>
                      <label className={`block text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Apply Scaling Method:</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleApplyScaling(exam.id, 'bellCurve')}
                          className="px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-amber-600 text-white text-xs rounded-lg hover:from-yellow-700 hover:to-amber-700 transition-all shadow-lg shadow-yellow-900/30"
                          title="Bell Curve (Z-Score)"
                        >
                          🎯 Bell Curve
                        </button>
                        <button
                          onClick={() => handleApplyScaling(exam.id, 'linearNormalization')}
                          className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-900/30"
                          title="Linear Normalization"
                        >
                          📏 Linear
                        </button>
                        <button
                          onClick={() => handleApplyScaling(exam.id, 'minMaxNormalization')}
                          className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-xs rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg shadow-purple-900/30"
                          title="Min-Max Normalization"
                        >
                          ⚖️ Min-Max
                        </button>
                        <button
                          onClick={() => handleApplyScaling(exam.id, 'percentile')}
                          className="px-3 py-1.5 bg-gradient-to-r from-pink-600 to-pink-700 text-white text-xs rounded-lg hover:from-pink-700 hover:to-pink-800 transition-all shadow-lg shadow-pink-900/30"
                          title="Percentile-Based"
                        >
                          📊 Percentile
                        </button>
                      </div>
                    </div>
                    
                    {/* Rounding Option */}
                    <div>
                      <label className={`block text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Round Scaled Marks:</label>
                      <button
                        onClick={() => handleApplyRounding(exam.id)}
                        className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm rounded-lg hover:from-green-700 hover:to-green-800 transition-all shadow-lg shadow-green-900/30 w-full"
                      >
                        🔢 Apply Rounding
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Marks Entry */}
        {data.students.length > 0 && data.exams.length > 0 && (
          <div className={`rounded-xl shadow-2xl p-6 mb-6 border transition-colors ${darkMode ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700/50' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-xl font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <span className="w-1 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></span>
              {editMode ? 'Edit Mark' : 'Add Marks'}
            </h2>
            
            {/* Student Search - Only show when not in edit mode */}
            {!editMode && (
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Search Student (ID or Name)
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedStudent(null);
                  }}
                  onKeyDown={handleKeyDown}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${darkMode ? 'bg-gray-900 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                  placeholder="Type student ID or name and press Tab/Enter..."
                />
                
                {/* Search Results */}
                {searchQuery && !selectedStudent && filteredStudents.length > 0 && (
                  <div className={`mt-2 border rounded-lg max-h-48 overflow-y-auto transition-colors ${darkMode ? 'border-gray-600 bg-gray-900' : 'border-gray-300 bg-white'}`}>
                    {filteredStudents.map(student => (
                      <div
                        key={student.id}
                        onClick={() => handleStudentSelect(student)}
                        className={`px-4 py-3 cursor-pointer border-b last:border-b-0 transition-colors ${darkMode ? 'hover:bg-blue-900/30 border-gray-700' : 'hover:bg-blue-50 border-gray-200'}`}
                      >
                        <div className={`font-medium ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{student.id}</div>
                        <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{student.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selected Student and Mark Entry */}
            {selectedStudent && (
              <form onSubmit={handleAddMark} className="space-y-4">
                <div className={`p-4 rounded-lg border transition-colors ${darkMode ? 'bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-blue-700/30' : 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-medium ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                        {editMode ? 'Editing: ' : 'Selected: '}{selectedStudent.id}
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{selectedStudent.name}</div>
                    </div>
                    {editMode && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 bg-red-600/80 text-white text-sm rounded-lg hover:bg-red-700 transition-all"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Select Exam
                  </label>
                  <select
                    value={selectedExam}
                    onChange={(e) => {
                      const examId = e.target.value;
                      setSelectedExam(examId);
                      // If student has existing mark for this exam, populate it and set edit mode
                      if (examId && selectedStudent.marks[examId] !== undefined) {
                        setMarkInput(selectedStudent.marks[examId].toString());
                        setEditMode(true);
                      } else {
                        setMarkInput('');
                        setEditMode(false);
                      }
                    }}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${darkMode ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                    required
                  >
                    <option value="">-- Select Exam --</option>
                    {data.exams.map(exam => (
                      <option key={exam.id} value={exam.id}>
                        {exam.name} (Max: {exam.totalMarks})
                        {selectedStudent.marks[exam.id] !== undefined ? ` - Current: ${selectedStudent.marks[exam.id]}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enter Mark {selectedExam && selectedStudent.marks[selectedExam] !== undefined && (
                      <span className={`text-xs ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>(Updating existing mark)</span>
                    )}
                  </label>
                  <input
                    ref={markInputRef}
                    type="number"
                    step="0.01"
                    value={markInput}
                    onChange={(e) => setMarkInput(e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${darkMode ? 'bg-gray-900 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                    placeholder="Enter mark..."
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full px-5 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg shadow-emerald-900/50 font-medium"
                >
                  {editMode ? '✓ Update Mark' : '✓ Add Mark'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Students Table */}
        {data.students.length > 0 && (
          <div className={`rounded-xl shadow-2xl p-6 border transition-colors ${darkMode ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 backdrop-blur-sm border-gray-700/50' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-xl font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full"></span>
              Students & Marks
            </h2>
            <div className="overflow-x-auto">
              <table className={`min-w-full divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                <thead className={darkMode ? 'bg-gray-900/50' : 'bg-gray-50'}>
                  <tr>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>ID</th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Name</th>
                    {data.exams.map(exam => (
                      <th key={exam.id} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <div>{exam.name}</div>
                        <div className={`text-[10px] font-normal mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Raw / Scaled / Rounded</div>
                      </th>
                    ))}
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700/50' : 'divide-gray-200'}`}>
                  {data.students.map((student, idx) => (
                    <tr key={student.id} className={`transition-colors ${darkMode ? `hover:bg-gray-700/30 ${idx % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-900/20'}` : `hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}`}>
                      <td className={`px-4 py-3 text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>{student.id}</td>
                      <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{student.name}</td>
                      {data.exams.map(exam => (
                        <td key={exam.id} className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {student.marks[exam.id] !== undefined ? (
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-1 rounded font-medium text-xs ${darkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                                Raw: {student.marks[exam.id]}
                              </span>
                              {student.scaledMarks?.[exam.id] !== undefined ? (
                                <span className={`px-2 py-1 rounded font-medium text-xs ${darkMode ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                                  Scaled: {student.scaledMarks[exam.id]}
                                </span>
                              ) : (
                                <span className={`text-xs italic ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>Not scaled</span>
                              )}
                              {student.roundedMarks?.[exam.id] !== undefined ? (
                                <span className={`px-2 py-1 rounded font-medium text-xs ${darkMode ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                                  Rounded: {student.roundedMarks[exam.id]}
                                </span>
                              ) : student.scaledMarks?.[exam.id] !== undefined ? (
                                <span className={`text-xs italic ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>Not rounded</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className={darkMode ? 'text-gray-600' : 'text-gray-400'}>-</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          {data.exams.map(exam => 
                            student.marks[exam.id] !== undefined ? (
                              <button
                                key={exam.id}
                                onClick={() => handleEditMark(student, exam.id)}
                                className="px-2 py-1 bg-blue-600/80 text-white text-xs rounded hover:bg-blue-700 transition-all"
                                title={`Edit ${exam.name}`}
                              >
                                ✏️
                              </button>
                            ) : null
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {data.students.length === 0 && (
          <div className={`rounded-xl shadow-2xl p-12 text-center border transition-colors ${darkMode ? 'bg-gradient-to-br from-gray-800 to-gray-800/80 border-gray-700/50' : 'bg-white border-gray-200'}`}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
              <span className="text-4xl">📚</span>
            </div>
            <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>No Students Yet</h3>
            <p className={`mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Get started by importing a CSV file with student data
            </p>
            <button
              onClick={() => setShowImport(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-900/50 font-medium"
            >
              📥 Import Students
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
