const { UserInputError, AuthenticationError } = require('apollo-server')
const jwt = require('jsonwebtoken')
const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'
const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const { PubSub } = require('graphql-subscriptions')
const pubsub = new PubSub()

const resolvers = {
  Query: {
    bookCount: async () => Book.collection.countDocuments(),
    authorCount: async () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      if (args.author) {
        const author = await Author.findOne({ name: args.author })
        return await Book.find({ author: author.id }).populate('author')
      }
      if (args.genre)
        return await Book.find({ genres: { $in: args.genre } }).populate(
          'author'
        )
      return await Book.find({}).populate('author')
    },
    allAuthors: async () => Author.find({}),
  },
  Author: {
    bookCount: async ({ name }) => {
      const author = await Author.findOne({ name: name })
      const books = await Book.find({ author: author.id })
      return books.length
    },
  },
  Mutation: {
    addBook: async (root, args, context) => {
      const username = context.username

      if (!username) throw new AuthenticationError('not authenticated')

      let author = await Author.findOne({ name: args.author })
      if (!author) {
        author = new Author({ name: args.author })
        try {
          await author.save()
        } catch (error) {
          throw new UserInputError(error.message, { invalidArgs: args })
        }
      }
      const book = new Book({ ...args, author: author.id })
      try {
        await book.save()
      } catch (error) {
        throw new UserInputError(error.message, { invalidArgs: args })
      }

      pubsub.publish('BOOK_ADDED', { bookAdded: book.populate('author') })

      return book.populate('author')
    },

    editAuthor: async (root, args, context) => {
      const username = context.username

      if (!username) throw new AuthenticationError('not authenticated')

      const author = await Author.findOne({ name: args.name })
      if (!author) return
      author.born = args.born
      try {
        await author.save()
      } catch (error) {
        throw new UserInputError(error.message, { invalidArgs: args })
      }
      return author
    },

    createUser: async (root, args) => {
      const user = new User(args)
      try {
        await user.save()
      } catch (error) {
        throw new UserInputError(error.message, { invalidArgs: args })
      }
      return user
    },

    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })
      if (!user || args.password !== 'secret')
        throw new UserInputError('wrong credentials')
      const userForToken = { username: user.username, id: user.id }
      const token = jwt.sign(userForToken, JWT_SECRET)
      return { token }
    },
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(['BOOK_ADDED']),
    },
  },
}

module.exports = resolvers
