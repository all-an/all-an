using System;

namespace Conditionals
{
    public class Program
    {
        public static void Main(string[] args)
        {
            int theVal = 50;

            Console.WriteLine("Hello World!");

            // TODO: if-else 


            // -----------------------
            // TODO: Using the ternary operator ?:

            // a two-case if-then
            /*
            if (theVal < 50) {
                Console.WriteLine("theVal is small");
            }
            else {
                Console.WriteLine("theVal is large");
            }
            */

            // TODO: can be replaced by a ternary operator ?:
            Console.WriteLine(theVal < 50 ? "Small" : "Large");

        }
    }
}
