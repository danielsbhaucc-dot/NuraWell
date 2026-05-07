'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play, Sparkles, Flame, ArrowLeft } from 'lucide-react';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-mesh overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center items-center px-4 pt-20 pb-32">
        <motion.div
          className="container-mobile relative z-10 text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Badge */}
          <motion.div variants={itemVariants} className="mb-8">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Sparkles className="w-4 h-4" />
              מופעל ב-AI ✨
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            variants={itemVariants}
            className="text-5xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight"
          >
            <span className="text-gradient">הדרך החכמה</span>
            <br />
            <span className="text-gray-900">לחיים בריאים</span>
          </motion.h1>

          {/* Subtitle Card — green gradient header style */}
          <motion.div variants={itemVariants} className="mb-10 max-w-md mx-auto">
            <div className="rounded-2xl overflow-hidden" style={{boxShadow: '0 4px 20px rgba(4,120,87,0.12)'}}>
              <div className="px-6 py-4" style={{background: 'linear-gradient(145deg, #047857, #059669, #10b981)'}}>
                <p className="text-white text-base md:text-lg leading-relaxed font-medium">
                  קורסים אינטראקטיביים עם מעקב התקדמות חכם, משימות יומיות והרגלים בריאים 🌿
                </p>
              </div>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center mb-12 max-w-sm mx-auto sm:max-w-none"
          >
            <Link
              href="/register"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-lg text-white transition-all hover:scale-105 active:scale-95"
              style={{background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 8px 25px rgba(4,120,87,0.25)'}}
            >
              <Play className="w-5 h-5 flex-shrink-0" />
              <span>התחל עכשיו - חינם!</span>
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg text-gray-700 bg-white border border-gray-200 transition-all hover:scale-105 active:scale-95 hover:border-emerald-300"
              style={{boxShadow: '0 2px 8px rgba(0,0,0,0.06)'}}
            >
              <span>כבר יש לי חשבון</span>
              <ArrowLeft className="w-5 h-5 flex-shrink-0" />
            </Link>
          </motion.div>

          {/* Stats Cards */}
          <motion.div variants={itemVariants} className="flex justify-center gap-4">
            {[
              { value: '95%', label: 'שביעות רצון', emoji: '⭐' },
              { value: '15kg', label: 'ממוצע ירידה', emoji: '🔥' },
              { value: '+500', label: 'סטודנטים', emoji: '🎓' },
            ].map((stat) => (
              <div key={stat.value}
                className="flex-1 max-w-[100px] text-center py-3 px-2 rounded-2xl bg-white border border-gray-100"
                style={{boxShadow: '0 2px 8px rgba(0,0,0,0.04)'}}>
                <div className="text-xl font-black text-gray-900 mb-0.5">{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.emoji} {stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 border-2 border-emerald-300 rounded-full flex justify-center">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"
            />
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium mb-4">הפיצ׳רים שלנו</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              מה מחכה לך? 🌟
            </h2>
            <p className="text-gray-500 text-lg">
              מערכת שלמה שתלווה אותך בכל שלב
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative rounded-3xl overflow-hidden transition-all duration-300 hover:scale-[1.01] cursor-default"
                style={{border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)'}}
              >
                {/* Green gradient header */}
                <div className="px-5 py-4 flex items-center gap-3"
                  style={{background: `linear-gradient(145deg, ${feature.color1}, ${feature.color2})`}}>
                  <span className="text-2xl">{feature.emoji}</span>
                  <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                </div>
                {/* White body */}
                <div className="px-5 py-4 bg-white">
                  <p className="text-gray-600 leading-relaxed text-[15px]">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-gray-50 border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-sm font-medium mb-4">כיצד להתחיל</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              איך זה עובד? 🚀
            </h2>
          </motion.div>

          <div className="space-y-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                className="flex items-center gap-5 p-5 rounded-3xl bg-white transition-all duration-300 hover:scale-[1.01]"
                style={{border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'}}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl flex-shrink-0"
                  style={{background: 'linear-gradient(135deg, #047857, #10b981)'}}>
                  {step.number}
                </div>
                <div className="text-right flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-gray-500 text-sm">{step.description}</p>
                </div>
                <div className="text-2xl">{step.emoji}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 relative overflow-hidden bg-white border-t border-gray-100">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-lg mx-auto text-center relative z-10"
        >
          <div className="rounded-3xl overflow-hidden" style={{boxShadow: '0 8px 40px rgba(4,120,87,0.15)'}}>
            <div className="p-10" style={{background: 'linear-gradient(145deg, #047857, #059669, #10b981)'}}>
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                מוכנים להתחיל?
              </h2>
              <p className="text-white/90 mb-8 text-lg">
                הצטרפו עכשיו וקבלו גישה מלאה לכל הקורסים
              </p>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-10 py-4 bg-white text-emerald-700 rounded-2xl font-black text-xl hover:scale-105 transition-all duration-200"
                style={{boxShadow: '0 4px 16px rgba(0,0,0,0.1)'}}
              >
                <Flame className="w-6 h-6" />
                בואו נתחיל!
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-gray-50 border-t border-gray-200">
        <div className="container-mobile text-center">
          <p className="text-gray-400 text-sm">
            © 2024 מערכת קורסים לירידה במשקל. כל הזכויות שמורות.
          </p>
        </div>
      </footer>
    </main>
  );
}

// Data
const features = [
  {
    emoji: '📚',
    title: 'קורסים מובנים',
    description: 'שיעורים בווידאו, אודיו, טקסט ומצגות - כל מה שצריך להצלחה',
    color1: '#10b981',
    color2: '#047857',
  },
  {
    emoji: '📊',
    title: 'מעקב התקדמות',
    description: 'עקבו אחרי ההתקדמות שלכם עם גרפים וסטטיסטיקות מפורטות',
    color1: '#14b8a6',
    color2: '#0d9488',
  },
  {
    emoji: '🔥',
    title: 'הרגלים יומיים',
    description: 'בנו הרגלים בריאים עם מערכת מטלות יומיות חכמה',
    color1: '#f97316',
    color2: '#ea580c',
  },
  {
    emoji: '🤖',
    title: 'AI ליווי אישי',
    description: 'קבלו המלצות חכמות מותאמות אישית לפרוגרס שלכם',
    color1: '#34d399',
    color2: '#10b981',
  },
];

const steps = [
  {
    number: '1',
    emoji: '📝',
    title: 'הרשמה מהירה',
    description: 'צרו חשבון ב-30 שניות והתחילו מיד',
  },
  {
    number: '2',
    emoji: '🎯',
    title: 'בחירת קורס',
    description: 'בחרו מהקורסים הזמינים או קבלו המלצה מ-AI',
  },
  {
    number: '3',
    emoji: '📖',
    title: 'למידה ותרגול',
    description: 'צפו בשיעורים, השלימו משימות ובנו הרגלים',
  },
  {
    number: '4',
    emoji: '🏆',
    title: 'תוצאות מדהימות',
    description: 'עקבו אחרי ההתקדמות וחגגו הישגים!',
  },
];
