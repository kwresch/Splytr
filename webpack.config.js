module.exports = {
  entry: './app/app.jsx',
  output: {
    path: __dirname,
    filename: './public/bundle.js'
  },
  resolve: {
    root: __dirname,
    alias: {
      Feedback: 'app/components/Feedback.jsx',
      Home: 'app/components/Home.jsx',
      History: 'app/components/History.jsx',
      Nav: 'app/components/Nav.jsx',
      ShoppingCart: 'app/components/ShoppingCart.jsx',

    },
    extensions: ['', '.js', '.jsx']
  },
  module: {
    loaders: [
      {
        loader: 'babel-loader',
        query: {
          presets: ['react', 'es2015', 'stage-0']
        },
        test: /\.jsx?$/,
        exclude: /(node_modules|bower_components)/
      }
    ]
  }
};