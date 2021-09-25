using System;

namespace Operators
{
    public class Program
    {
        public static void Main(string[] args)
        {
            // Declare some variables to excercise the operators
            int x=10, y=5;
            string a="abcd", b="efgh";

            // TODO: Basic math operators are +, -, /, *
            Console.WriteLine("----- Basic Math -----");


            // TODO: Increment / decrement operators
            Console.WriteLine("----- Shorthand -----");


            // TODO: Operators can be shorthand: a = a + b


            // TODO: Logical operators &&, ||
            // Console.WriteLine("----- Logic Operators -----");


            // null-coalescing operators
            string str = null;
            // TODO: the ?? operator uses left operand if not null, or right one if it is
            Console.WriteLine(str ?? "Unknow string");

            str ??= "New String";
            Console.WriteLine(str);
            
            // TODO: the ??= operator assigns the right operand if the left one is null
            // it replaces the code:
            // if (variable is null) {
            //    variable = somevalue;
            // }

        }
    }
}
