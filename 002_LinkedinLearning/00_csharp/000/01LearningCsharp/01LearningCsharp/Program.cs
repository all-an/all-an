//Conditionals with Switch
using System;

namespace _01LearningCsharp
{
    class Program
    {
        static void Main(string[] args)
        {
            int theVal = 53;

            // TODO: The switch statement
            Console.WriteLine(theVal);

            switch (theVal)
            {
                case 50:
                Console.WriteLine("theVal is 50");
                    break;
                case 51:
                    Console.WriteLine("theVal is 51");
                    break;
                case 52:
                case 53:
                case 54:
                    Console.WriteLine("theVal is between 52 and 54");
                    break;
                default:
                    Console.WriteLine("theVal is something else");
                    break;
            }
        }
    }
}
